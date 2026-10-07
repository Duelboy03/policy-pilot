import {
  ask,
  ClaudeAnswerer,
  ExtractiveAnswerer,
  HashingEmbedder,
  KnowledgeBase,
  slug,
  titleFromFilename,
  type Answerer,
  type AskEvent,
  type Embedder,
} from '@policypilot/core'
import { HANDBOOK } from '@policypilot/core/data'
import type { AskOptions, ClaudeConfig, DocInfo, Engine, EngineStatus } from './types'
import { extractPdf } from '../lib/pdf'

const MAX_BYTES = 2 * 1024 * 1024

/**
 * Everything runs in the browser: chunking, indexing, a small embedding model (Transformers.js, WebAssembly)
 * and, optionally, the Anthropic API with a key the user pastes in. Nothing is uploaded to a server.
 */
export class LocalEngine implements Engine {
  readonly kind = 'local' as const
  private kb = new KnowledgeBase(null)
  private neural: Embedder | null = null
  private claude: ClaudeConfig | null = null
  private listeners = new Set<() => void>()
  private status: EngineStatus = {
    kind: 'local',
    neural: { state: 'idle', progress: 0, model: null },
    answerer: 'extractive',
    documents: [],
  }

  getStatus = () => this.status
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  knowledgeBase = () => this.kb

  private set(patch: Partial<EngineStatus>) {
    this.status = { ...this.status, ...patch }
    this.listeners.forEach((l) => l())
  }
  private refreshDocs() {
    this.set({ documents: this.kb.documents as DocInfo[] })
  }

  private started = false

  async init() {
    if (this.started) return // React StrictMode runs effects twice in development
    this.started = true
    this.kb.importState(HANDBOOK) // chunked and embedded ahead of time, so the handbook is searchable at once
    this.refreshDocs()
    const lite = new URLSearchParams(location.search).get('embedder') === 'hash'
    // `?embedder=hash` skips the 23 MB model download (used by the automated tests)
    if (lite) await this.useNeural(false)
    else void this.loadNeural()
  }

  private async loadNeural() {
    this.set({ neural: { state: 'loading', progress: 0, model: 'MiniLM-L6-v2' } })
    try {
      const { createTransformersEmbedder } = await import('@policypilot/core/transformers')
      const e = await createTransformersEmbedder({
        device: 'wasm',
        onProgress: (f) => this.set({ neural: { state: 'loading', progress: Math.min(0.99, f), model: 'MiniLM-L6-v2' } }),
      })
      this.neural = e
      await this.kb.setEmbedder(e) // reuses the precomputed handbook vectors; embeds only uploads
      this.set({ neural: { state: 'ready', progress: 1, model: 'MiniLM-L6-v2' } })
      this.refreshDocs()
    } catch (err) {
      this.set({ neural: { state: 'error', progress: 0, model: null, error: err instanceof Error ? err.message : String(err) } })
    }
  }

  async useNeural(on: boolean) {
    if (on) {
      if (this.neural) {
        await this.kb.setEmbedder(this.neural)
        this.set({ neural: { state: 'ready', progress: 1, model: 'MiniLM-L6-v2' } })
      } else await this.loadNeural()
    } else {
      const h = new HashingEmbedder()
      await this.kb.setEmbedder(h)
      this.set({ neural: { state: 'off', progress: 0, model: 'hashing (lightweight)' } })
    }
  }

  configureClaude(cfg: ClaudeConfig | null) {
    this.claude = cfg && cfg.apiKey.trim() ? { ...cfg, apiKey: cfg.apiKey.trim() } : null
    this.set({ answerer: this.claude ? 'claude' : 'extractive', claudeModel: this.claude?.model })
  }

  private answerer(): Answerer {
    if (this.claude) return new ClaudeAnswerer({ apiKey: this.claude.apiKey, model: this.claude.model, browser: true })
    return new ExtractiveAnswerer({ embedder: this.neural ?? undefined })
  }

  ask(question: string, opts: AskOptions): AsyncGenerator<AskEvent> {
    return ask(this.kb, this.answerer(), question, opts)
  }

  async addFile(file: File): Promise<DocInfo> {
    if (file.size > MAX_BYTES) throw new Error('That file is larger than 2 MB.')
    let title = titleFromFilename(file.name)
    if (/\.pdf$/i.test(file.name)) {
      const pages = await extractPdf(file)
      return this.add({ id: `upload-${slug(title)}`, title, text: '', pages })
    }
    if (!/\.(md|markdown|txt)$/i.test(file.name)) throw new Error('Upload a .md, .txt or .pdf file.')
    const text = await file.text()
    const h1 = /^#\s+(.+)$/m.exec(text)?.[1]
    if (h1) title = h1.trim()
    return this.add({ id: `upload-${slug(title)}`, title, text })
  }

  async addText(title: string, text: string): Promise<DocInfo> {
    if (text.trim().length < 20) throw new Error('Paste at least a sentence or two.')
    return this.add({ id: `upload-${slug(title)}`, title: title.trim() || 'Pasted text', text })
  }

  private async add(doc: { id: string; title: string; text: string; pages?: string[] }): Promise<DocInfo> {
    if (this.kb.documents.some((d) => d.id === doc.id && d.source === 'handbook')) throw new Error('That name is used by a built-in document.')
    const chunks = await this.kb.addDocument({ ...doc, source: 'upload' })
    this.refreshDocs()
    return { id: doc.id, title: doc.title, source: 'upload', chunks }
  }

  async removeDocument(id: string) {
    const d = this.kb.documents.find((x) => x.id === id)
    if (d?.source === 'handbook') throw new Error('Built-in documents cannot be removed.')
    this.kb.removeDocument(id)
    this.refreshDocs()
  }
}

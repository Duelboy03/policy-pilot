import type { AskEvent, Passage } from '@policypilot/core'
import type { AskOptions, DocInfo, Engine, EngineStatus } from './types'

/** Talks to the Express API, which holds the embedding model and any Anthropic key. */
export class ServerEngine implements Engine {
  readonly kind = 'server' as const
  private listeners = new Set<() => void>()
  private status: EngineStatus = { kind: 'server', neural: { state: 'loading', progress: 0, model: null }, answerer: 'extractive', documents: [] }

  getStatus = () => this.status
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private set(p: Partial<EngineStatus>) {
    this.status = { ...this.status, ...p }
    this.listeners.forEach((l) => l())
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, init).catch(() => {
      throw new Error('Cannot reach the server. Is it running?')
    })
    if (res.status === 204) return undefined as T
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? res.statusText)
    return body as T
  }

  async init() {
    try {
      const h = await this.json<{ embedder: string | null; answerer: 'extractive' | 'claude' }>('/health')
      const documents = await this.json<DocInfo[]>('/docs')
      this.set({ offline: false, documents, answerer: h.answerer, neural: { state: h.embedder ? 'ready' : 'off', progress: 1, model: h.embedder } })
    } catch {
      this.set({ offline: true, neural: { state: 'error', progress: 0, model: null, error: 'Server unreachable' } })
    }
  }

  private async refresh() {
    this.set({ documents: await this.json<DocInfo[]>('/docs') })
  }

  async *ask(question: string, opts: AskOptions): AsyncGenerator<AskEvent> {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, mode: opts.mode, k: opts.k }),
      signal: opts.signal,
    })
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'The server could not answer that.')
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const event = /^event: (.*)$/m.exec(block)?.[1]
        const data = /^data: (.*)$/m.exec(block)?.[1]
        if (!event || !data) continue
        const payload = JSON.parse(data)
        if (event === 'sources') yield { type: 'sources', mode: payload.mode, confident: payload.confident, passages: payload.passages as Passage[] }
        else if (event === 'token') yield { type: 'token', text: payload.text }
        else if (event === 'error') throw new Error(payload.message)
        else if (event === 'done') yield { type: 'done' }
      }
    }
  }

  async addFile(file: File): Promise<DocInfo> {
    const body = new FormData()
    body.append('file', file)
    const r = await this.json<{ id: string; title: string; chunks: number }>('/docs', { method: 'POST', body })
    await this.refresh()
    return { ...r, source: 'upload' }
  }
  async addText(title: string, text: string): Promise<DocInfo> {
    const r = await this.json<{ id: string; title: string; chunks: number }>('/docs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, text }),
    })
    await this.refresh()
    return { ...r, source: 'upload' }
  }
  async removeDocument(id: string) {
    await this.json(`/docs/${id}`, { method: 'DELETE' })
    await this.refresh()
  }
}

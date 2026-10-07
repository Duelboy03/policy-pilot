import { Bm25Index } from './bm25'
import { chunkDocument, type ChunkOptions } from './chunk'
import type { Embedder } from './embed'
import { isStop, stem, tokenize, words } from './tokenize'
import type { Chunk, DocInput, Hit, RetrievalMode, SearchResult } from './types'
import { reciprocalRankFusion, topK } from './vector'

export interface SearchOptions {
  mode?: RetrievalMode
  /** relative weight of [keyword, semantic] in hybrid fusion */
  fusionWeights?: [number, number]
  /** how many hits to return */
  k?: number
}

export interface KbState {
  docs: { id: string; title: string; source: 'handbook' | 'upload' }[]
  chunks: Chunk[]
  /** embeddings, row i belongs to chunks[i]; absent when none were computed */
  vectors?: number[][]
  embedder?: string
}

/** Thresholds below which the knowledge base declines to answer. Tuned with the evaluation set. */
export const CONFIDENCE = { denseMin: 0.32, keywordCoverageMin: 0.5 }

/** [keyword, semantic] weights for hybrid search, chosen with the evaluation set (see the README) */
export const FUSION_WEIGHTS: [number, number] = [1, 1]

/**
 * The retrieval half of RAG: chunks documents, indexes them for keyword (BM25) and semantic
 * (embedding) search and merges the two with reciprocal rank fusion.
 */
export class KnowledgeBase {
  private docs = new Map<string, { id: string; title: string; source: 'handbook' | 'upload' }>()
  private chunks: Chunk[] = []
  private vectors: (Float32Array | null)[] = []
  private bm25: Bm25Index | null = null
  private chunkTokens: string[][] = []
  /** vectors from an imported index, kept so a later embedder with the same name can reuse them */
  private saved = new Map<string, { embedder: string; vector: number[] }>()

  constructor(
    private embedder: Embedder | null = null,
    private chunkOpts: ChunkOptions = {},
  ) {}

  get documents() {
    return [...this.docs.values()].map((d) => ({ ...d, chunks: this.chunks.filter((c) => c.docId === d.id).length }))
  }
  get chunkCount() {
    return this.chunks.length
  }
  get embedderName() {
    return this.embedder?.name ?? null
  }
  get hasVectors() {
    return this.vectors.length > 0 && this.vectors.every((v) => v !== null)
  }
  getChunk(id: string) {
    return this.chunks.find((c) => c.id === id)
  }

  /** swap the embedder (for example once the neural model has finished loading) and re-embed everything */
  async setEmbedder(e: Embedder | null, onProgress?: (done: number, total: number) => void) {
    this.embedder = e
    // chunks that came with precomputed vectors from the same model do not need embedding again
    this.vectors = this.chunks.map((c) => {
      const s = this.saved.get(c.id)
      return e && s && s.embedder === e.name ? Float32Array.from(s.vector) : null
    })
    if (e) await this.embedAll(onProgress)
  }

  async addDocument(doc: DocInput): Promise<number> {
    this.removeDocument(doc.id)
    const chunks = chunkDocument(doc, this.chunkOpts)
    this.docs.set(doc.id, { id: doc.id, title: doc.title, source: doc.source ?? 'upload' })
    this.chunks.push(...chunks)
    this.vectors.push(...chunks.map(() => null))
    this.bm25 = null
    if (this.embedder) await this.embedAll()
    return chunks.length
  }

  removeDocument(id: string) {
    if (!this.docs.delete(id)) return
    const keep = this.chunks.map((c) => c.docId !== id)
    this.chunks = this.chunks.filter((_, i) => keep[i])
    this.vectors = this.vectors.filter((_, i) => keep[i])
    this.bm25 = null
  }

  private async embedAll(onProgress?: (done: number, total: number) => void) {
    if (!this.embedder) return
    const todo = this.chunks.map((c, i) => [c, i] as const).filter(([, i]) => this.vectors[i] === null)
    const BATCH = 16
    for (let i = 0; i < todo.length; i += BATCH) {
      const part = todo.slice(i, i + BATCH)
      const vecs = await this.embedder.embed(part.map(([c]) => c.embedText))
      part.forEach(([, idx], j) => (this.vectors[idx] = vecs[j]))
      onProgress?.(Math.min(todo.length, i + BATCH), todo.length)
    }
  }

  private index(): Bm25Index {
    if (!this.bm25) {
      this.chunkTokens = this.chunks.map((c) => [
        // the heading and title say what a chunk is about, so they count twice
        ...tokenize(c.docTitle),
        ...tokenize(c.heading),
        ...tokenize(c.heading),
        ...tokenize(c.text),
      ])
      this.bm25 = new Bm25Index(this.chunks.map((c, i) => ({ id: c.id, tokens: this.chunkTokens[i] })))
    }
    return this.bm25
  }

  /** share of the question's content words (stemmed) found in the chunk */
  private coverageOf(queryStems: string[], chunk: Chunk): number {
    if (queryStems.length === 0) return 0
    const have = new Set(tokenize(`${chunk.docTitle} ${chunk.heading} ${chunk.text}`))
    return queryStems.filter((t) => have.has(t)).length / queryStems.length
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
    const k = opts.k ?? 5
    const wanted = opts.mode ?? 'semantic'
    const semanticReady = !!this.embedder && this.hasVectors
    // fall back gracefully: semantic or hybrid without embeddings is keyword search
    const mode: RetrievalMode = wanted !== 'keyword' && !semanticReady ? 'keyword' : wanted
    const pool = Math.max(k * 4, 20)

    const qStems = [...new Set(tokenize(query))]
    const index = this.index()
    const kw = mode === 'semantic' ? [] : index.search(qStems, pool)
    let dense: { id: string; score: number }[] = []
    if (mode !== 'keyword' && this.embedder) {
      const [q] = await this.embedder.embed([query])
      dense = topK(q, this.vectors as Float32Array[], this.chunks.map((c) => c.id), pool)
    }

    const kwRank = new Map(kw.map((h, i) => [h.id, { score: h.score, rank: i + 1 }]))
    const denseRank = new Map(dense.map((h, i) => [h.id, { score: h.score, rank: i + 1 }]))

    let ordered: { id: string; score: number }[]
    if (mode === 'keyword') ordered = kw
    else if (mode === 'semantic') ordered = dense
    else {
      const fused = reciprocalRankFusion([kw.map((h) => h.id), dense.map((h) => h.id)], 60, opts.fusionWeights ?? FUSION_WEIGHTS)
      ordered = [...fused.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score)
    }

    const byId = new Map(this.chunks.map((c) => [c.id, c]))
    const hits: Hit[] = ordered.slice(0, k).map((o) => {
      const chunk = byId.get(o.id)!
      return { chunk, score: o.score, bm25: kwRank.get(o.id), dense: denseRank.get(o.id), coverage: this.coverageOf(qStems, chunk) }
    })

    return { mode, hits, confident: this.isConfident(mode, hits, qStems) }
  }

  /**
   * Decide whether the best hits look like an answer rather than noise. Keyword search needs most of the
   * question's content words to appear in a chunk; vector search needs a similarity above the embedder's floor.
   */
  private isConfident(mode: RetrievalMode, hits: Hit[], qStems: string[]): boolean {
    if (hits.length === 0 || qStems.length === 0) return false
    if (mode === 'keyword') return Math.max(...hits.map((h) => h.coverage)) >= CONFIDENCE.keywordCoverageMin
    const floor = this.embedder?.denseFloor ?? CONFIDENCE.denseMin
    return Math.max(0, ...hits.map((h) => h.dense?.score ?? 0)) >= floor
  }

  exportState(): KbState {
    return {
      docs: [...this.docs.values()],
      chunks: this.chunks,
      vectors: this.hasVectors ? (this.vectors as Float32Array[]).map((v) => Array.from(v, (x) => Math.round(x * 1e5) / 1e5)) : undefined,
      embedder: this.embedder?.name,
    }
  }

  /** load a saved index; vectors are only used if they came from the same embedder */
  importState(state: KbState) {
    this.docs = new Map(state.docs.map((d) => [d.id, d]))
    this.chunks = state.chunks
    this.saved = new Map()
    if (state.vectors && state.embedder) state.chunks.forEach((c, i) => this.saved.set(c.id, { embedder: state.embedder!, vector: state.vectors![i] }))
    const usable = state.vectors && state.embedder && state.embedder === this.embedder?.name
    this.vectors = usable ? state.vectors!.map((v) => Float32Array.from(v)) : this.chunks.map(() => null)
    this.bm25 = null
  }
}

/** content words of a question, for display and highlighting */
export function contentWords(text: string): string[] {
  return [...new Set(words(text).filter((w) => !isStop(w) && w.length > 1))]
}

export { stem }

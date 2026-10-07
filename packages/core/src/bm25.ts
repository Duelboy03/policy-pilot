export interface Bm25Doc {
  id: string
  tokens: string[]
}

export interface Bm25Options {
  k1?: number
  b?: number
}

/** Okapi BM25 over pre-tokenised documents. */
export class Bm25Index {
  private tf: Map<string, number>[] = []
  private len: number[] = []
  private df = new Map<string, number>()
  private ids: string[] = []
  private avg = 0
  private k1: number
  private b: number

  constructor(docs: Bm25Doc[], opts: Bm25Options = {}) {
    this.k1 = opts.k1 ?? 1.5
    this.b = opts.b ?? 0.75
    for (const d of docs) {
      const counts = new Map<string, number>()
      for (const t of d.tokens) counts.set(t, (counts.get(t) ?? 0) + 1)
      this.tf.push(counts)
      this.len.push(d.tokens.length)
      this.ids.push(d.id)
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1)
    }
    this.avg = this.len.length ? this.len.reduce((a, b) => a + b, 0) / this.len.length : 0
  }

  get size() {
    return this.ids.length
  }

  idf(term: string): number {
    const n = this.df.get(term) ?? 0
    return Math.log(1 + (this.size - n + 0.5) / (n + 0.5))
  }

  has(term: string): boolean {
    return this.df.has(term)
  }

  /** score of every document that shares at least one term with the query, best first */
  search(query: string[], k = 10): { id: string; score: number }[] {
    const terms = [...new Set(query)]
    const scores: { id: string; score: number }[] = []
    for (let i = 0; i < this.ids.length; i++) {
      let s = 0
      for (const t of terms) {
        const f = this.tf[i].get(t)
        if (!f) continue
        const norm = f + this.k1 * (1 - this.b + (this.b * this.len[i]) / (this.avg || 1))
        s += this.idf(t) * ((f * (this.k1 + 1)) / norm)
      }
      if (s > 0) scores.push({ id: this.ids[i], score: s })
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, k)
  }
}

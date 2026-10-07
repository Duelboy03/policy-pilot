import { tokenize } from './tokenize'

export interface Embedder {
  readonly name: string
  readonly dim: number
  /** similarity below which a match is treated as unrelated, calibrated per model */
  readonly denseFloor?: number
  /** returns one L2-normalised vector per text */
  embed(texts: string[]): Promise<Float32Array[]>
}

/** FNV-1a, 32-bit */
function fnv(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n)
  if (n === 0) return v
  for (let i = 0; i < v.length; i++) v[i] /= n
  return v
}

/**
 * A dependency-free embedder: stemmed words and word pairs hashed into a fixed-size
 * signed vector. It has no notion of meaning, only shared vocabulary, so it is used
 * for tests, offline fallback and as the baseline the neural model is compared with.
 */
export class HashingEmbedder implements Embedder {
  readonly name = 'hashing'
  readonly denseFloor = 0.25
  constructor(readonly dim = 384) {}

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => {
      const v = new Float32Array(this.dim)
      const toks = tokenize(t)
      const add = (feature: string, w: number) => {
        const h = fnv(feature)
        v[h % this.dim] += (h & 0x80000000 ? -1 : 1) * w
      }
      toks.forEach((tok, i) => {
        add(tok, 1)
        if (i > 0) add(`${toks[i - 1]}_${tok}`, 0.5)
      })
      return normalize(v)
    })
  }
}

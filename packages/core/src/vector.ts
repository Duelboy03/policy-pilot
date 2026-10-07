/** cosine similarity of two L2-normalised vectors is their dot product */
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export function topK(query: Float32Array, vectors: Float32Array[], ids: string[], k: number): { id: string; score: number }[] {
  const out = vectors.map((v, i) => ({ id: ids[i], score: dot(query, v) }))
  return out.sort((a, b) => b.score - a.score).slice(0, k)
}

/**
 * Reciprocal rank fusion: each list contributes 1 / (k + rank). It needs no score
 * calibration between retrievers, which is why it is the usual way to merge BM25 and vector search.
 * `weights` lets one retriever count for more than another.
 */
export function reciprocalRankFusion(lists: string[][], k = 60, weights: number[] = lists.map(() => 1)): Map<string, number> {
  const fused = new Map<string, number>()
  lists.forEach((list, li) => {
    list.forEach((id, i) => fused.set(id, (fused.get(id) ?? 0) + (weights[li] ?? 1) / (k + i + 1)))
  })
  return fused
}

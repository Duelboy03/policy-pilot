import { normalize, type Embedder } from './embed'

export const MINILM = 'Xenova/all-MiniLM-L6-v2'

export interface TransformersOptions {
  model?: string
  /** called while model files download: 0 to 1 */
  onProgress?: (fraction: number, file?: string) => void
  /** 'wasm' in browsers without WebGPU, left unset in Node */
  device?: 'wasm' | 'webgpu' | 'cpu'
}

/**
 * Neural sentence embeddings from a small open model (all-MiniLM-L6-v2, 384 dimensions) running locally with
 * Transformers.js: ONNX Runtime in Node, WebAssembly in the browser. The model is downloaded once and cached.
 * Loaded lazily so the library is not part of the bundle until it is needed.
 */
export async function createTransformersEmbedder(opts: TransformersOptions = {}): Promise<Embedder> {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  const files = new Map<string, { loaded: number; total: number }>()
  const extractor = await pipeline('feature-extraction', opts.model ?? MINILM, {
    dtype: 'q8',
    device: opts.device,
    progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file && p.total) {
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
        const all = [...files.values()]
        opts.onProgress?.(all.reduce((a, f) => a + f.loaded, 0) / all.reduce((a, f) => a + f.total, 0), p.file)
      }
    },
  } as never)
  opts.onProgress?.(1)

  return {
    name: 'minilm-l6-v2',
    dim: 384,
    denseFloor: 0.32,
    async embed(texts: string[]) {
      const out = await extractor(texts, { pooling: 'mean', normalize: true })
      const [n, d] = out.dims as [number, number]
      const flat = out.data as Float32Array
      return Array.from({ length: n }, (_, i) => normalize(Float32Array.from(flat.subarray(i * d, (i + 1) * d))))
    },
  }
}

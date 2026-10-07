import type { AskEvent, RetrievalMode } from '@policypilot/core'

export interface DocInfo {
  id: string
  title: string
  source: 'handbook' | 'upload'
  chunks: number
}

export type NeuralState = 'idle' | 'loading' | 'ready' | 'error' | 'off'

export interface EngineStatus {
  kind: 'local' | 'server'
  neural: { state: NeuralState; progress: number; model: string | null; error?: string }
  answerer: 'extractive' | 'claude'
  claudeModel?: string
  documents: DocInfo[]
  /** server mode only: the server could not be reached */
  offline?: boolean
}

export interface AskOptions {
  mode: RetrievalMode
  k: number
  signal?: AbortSignal
}

export interface ClaudeConfig {
  apiKey: string
  model: string
}

export interface Engine {
  readonly kind: 'local' | 'server'
  getStatus(): EngineStatus
  subscribe(fn: () => void): () => void
  init(): Promise<void>
  ask(question: string, opts: AskOptions): AsyncGenerator<AskEvent>
  addFile(file: File): Promise<DocInfo>
  addText(title: string, text: string): Promise<DocInfo>
  removeDocument(id: string): Promise<void>
  /** local engine only */
  configureClaude?(cfg: ClaudeConfig | null): void
  /** local engine only: switch between the neural model and the lightweight hashing embedder */
  useNeural?(on: boolean): Promise<void>
  /** local engine only: the knowledge base, for the evaluation page */
  knowledgeBase?(): import('@policypilot/core').KnowledgeBase
}

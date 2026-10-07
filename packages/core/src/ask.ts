import { NO_ANSWER, type Answerer } from './answer'
import type { KnowledgeBase } from './kb'
import type { Passage, RetrievalMode, SearchResult } from './types'

export type AskEvent =
  | { type: 'sources'; mode: RetrievalMode; confident: boolean; passages: Passage[] }
  | { type: 'token'; text: string }
  | { type: 'done' }

export interface AskOptions {
  mode?: RetrievalMode
  /** how many passages to retrieve and show */
  k?: number
  signal?: AbortSignal
}

/**
 * The whole RAG loop as a stream of events: retrieve, then answer from what was retrieved.
 * If retrieval finds nothing relevant the model is not called at all, which both saves money and
 * removes the chance of an invented answer.
 */
export async function* ask(kb: KnowledgeBase, answerer: Answerer, question: string, opts: AskOptions = {}): AsyncGenerator<AskEvent> {
  const result: SearchResult = await kb.search(question, { mode: opts.mode, k: opts.k ?? 4 })
  const passages: Passage[] = result.hits.map((hit, i) => ({ n: i + 1, hit }))
  yield { type: 'sources', mode: result.mode, confident: result.confident, passages }
  if (!result.confident) {
    yield { type: 'token', text: NO_ANSWER }
  } else {
    for await (const text of answerer.answer(question, passages, { signal: opts.signal })) yield { type: 'token', text }
  }
  yield { type: 'done' }
}

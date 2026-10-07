export interface DocInput {
  id: string
  title: string
  /** markdown or plain text; ignored when `pages` is given */
  text: string
  /** one string per page, for PDFs */
  pages?: string[]
  source?: 'handbook' | 'upload'
}

export interface Chunk {
  id: string
  docId: string
  docTitle: string
  /** nearest heading path below the document title, '' when there is none */
  heading: string
  text: string
  /** the text that is embedded: title and heading give the chunk its context */
  embedText: string
  index: number
  page?: number
}

export type RetrievalMode = 'hybrid' | 'keyword' | 'semantic'

export interface Hit {
  chunk: Chunk
  /** final score for the chosen mode */
  score: number
  bm25?: { score: number; rank: number }
  dense?: { score: number; rank: number }
  /** fraction of the question's content words that appear in the chunk */
  coverage: number
}

export interface SearchResult {
  mode: RetrievalMode
  hits: Hit[]
  /** false when nothing in the knowledge base looks relevant enough to answer from */
  confident: boolean
}

export interface Passage {
  /** citation number shown to the reader, starting at 1 */
  n: number
  hit: Hit
}

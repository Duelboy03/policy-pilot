import { ClaudeAnswerer, ExtractiveAnswerer, KnowledgeBase, type PdfJsLike } from '@policypilot/core'
import { HANDBOOK } from '@policypilot/core/data'
import { createTransformersEmbedder } from '@policypilot/core/transformers'
import { createApp } from './app'

const port = Number(process.env.PORT ?? 4100)
const key = process.env.ANTHROPIC_API_KEY

console.log('Loading the embedding model...')
const embedder = await createTransformersEmbedder({})
const kb = new KnowledgeBase(embedder)
kb.importState(HANDBOOK) // chunks and vectors were computed ahead of time by `npm run build:index`
if (!kb.hasVectors) await kb.setEmbedder(embedder)

const answerer = key
  ? new ClaudeAnswerer({ apiKey: key, model: process.env.CLAUDE_MODEL, baseUrl: process.env.ANTHROPIC_BASE_URL })
  : new ExtractiveAnswerer({ embedder })
const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike

createApp({
  kb,
  answerer,
  pdfjs,
  info: { embedder: embedder.name, answerer: answerer.name },
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
}).listen(port, () => console.log(`PolicyPilot API on http://localhost:${port} (answers: ${answerer.name}, retrieval: ${embedder.name})`))

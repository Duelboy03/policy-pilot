import { ask, type Answerer, type KnowledgeBase, pdfToPages, slug, titleFromFilename, type RetrievalMode, type PdfJsLike, type Passage } from '@policypilot/core'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import multer from 'multer'
import { z } from 'zod'

export interface AppDeps {
  kb: KnowledgeBase
  answerer: Answerer
  /** reported by /api/health so the UI can show what is running */
  info: { embedder: string | null; answerer: string }
  /** pdf.js build for Node; omit to reject PDF uploads */
  pdfjs?: PdfJsLike
  corsOrigins?: string[]
  /** questions allowed per client per minute */
  askLimit?: number
}

const MAX_UPLOAD = 2 * 1024 * 1024
const MAX_QUESTION = 600
const askBody = z.object({
  question: z.string().trim().min(2).max(MAX_QUESTION),
  mode: z.enum(['hybrid', 'keyword', 'semantic']).optional(),
  k: z.number().int().min(1).max(8).optional(),
})
const textBody = z.object({ title: z.string().trim().min(1).max(120), text: z.string().min(20).max(MAX_UPLOAD) })

/** the embedded text duplicates the chunk text, so it is not sent to the browser */
const slim = (p: Passage) => ({ ...p, hit: { ...p.hit, chunk: { ...p.hit.chunk, embedText: undefined } } })

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function createApp(d: AppDeps) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  if (d.corsOrigins) app.use(cors({ origin: d.corsOrigins }))
  app.use(express.json({ limit: '3mb' }))
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD, files: 1 } })

  const hits = new Map<string, { n: number; reset: number }>()
  const limit = d.askLimit ?? 30
  const limiter = (req: Request, _res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown'
    const now = Date.now()
    const h = hits.get(key)
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + 60_000 })
    else if (++h.n > limit) return next(new HttpError(429, 'Too many questions. Wait a minute and try again.'))
    next()
  }

  const api = express.Router()
  api.get('/health', (_req, res) => res.json({ ok: true, ...d.info, documents: d.kb.documents.length, chunks: d.kb.chunkCount }))
  api.get('/docs', (_req, res) => res.json(d.kb.documents))

  api.post('/docs', upload.single('file'), async (req, res) => {
    let id: string
    let title: string
    let text = ''
    let pages: string[] | undefined
    if (req.file) {
      const name = req.file.originalname
      title = titleFromFilename(name)
      if (/\.pdf$/i.test(name)) {
        if (!d.pdfjs) throw new HttpError(415, 'PDF upload is not enabled on this server.')
        try {
          pages = await pdfToPages(d.pdfjs, new Uint8Array(req.file.buffer))
        } catch {
          throw new HttpError(422, 'That PDF could not be read.')
        }
        if (pages.length === 0) throw new HttpError(422, 'No text found in that PDF. Scanned PDFs need OCR first.')
      } else if (/\.(md|markdown|txt)$/i.test(name)) {
        text = req.file.buffer.toString('utf8')
        const h1 = /^#\s+(.+)$/m.exec(text)?.[1]
        if (h1) title = h1.trim()
      } else throw new HttpError(415, 'Upload a .md, .txt or .pdf file.')
      id = `upload-${slug(title)}`
    } else {
      const p = textBody.safeParse(req.body)
      if (!p.success) throw new HttpError(422, 'Send a file, or JSON with a title and at least 20 characters of text.')
      title = p.data.title
      text = p.data.text
      id = `upload-${slug(title)}`
    }
    if (d.kb.documents.some((x) => x.id === id && x.source === 'handbook')) throw new HttpError(409, 'That name is used by a built-in document.')
    const chunks = await d.kb.addDocument({ id, title, text, pages, source: 'upload' })
    res.status(201).json({ id, title, chunks })
  })

  api.delete('/docs/:id', (req, res) => {
    const doc = d.kb.documents.find((x) => x.id === req.params.id)
    if (!doc) throw new HttpError(404, 'Document not found.')
    if (doc.source === 'handbook') throw new HttpError(403, 'Built-in documents cannot be removed.')
    d.kb.removeDocument(doc.id)
    res.status(204).end()
  })

  api.post('/search', async (req, res) => {
    const p = askBody.safeParse(req.body)
    if (!p.success) throw new HttpError(422, 'Send a question of 2 to 600 characters.')
    res.json(await d.kb.search(p.data.question, { mode: p.data.mode as RetrievalMode, k: p.data.k }))
  })

  /** Server-sent events: `sources` first, then `token` events, then `done`. */
  api.post('/ask', limiter, async (req, res) => {
    const p = askBody.safeParse(req.body)
    if (!p.success) throw new HttpError(422, 'Send a question of 2 to 600 characters.')
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    try {
      for await (const ev of ask(d.kb, d.answerer, p.data.question, { mode: p.data.mode as RetrievalMode, k: p.data.k, signal: controller.signal })) {
        if (ev.type === 'sources') send('sources', { mode: ev.mode, confident: ev.confident, passages: ev.passages.map(slim) })
        else if (ev.type === 'token') send('token', { text: ev.text })
        else send('done', {})
      }
    } catch (e) {
      if (!controller.signal.aborted) send('error', { message: e instanceof Error ? e.message : 'Something went wrong.' })
    }
    res.end()
  })

  api.use((_req, _res, next) => next(new HttpError(404, 'Not found.')))
  app.use('/api', api)

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return res.end()
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
    if (err instanceof multer.MulterError) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 2 MB.' : err.message })
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Request body is not valid JSON.' })
    console.error(err)
    res.status(500).json({ error: 'Something went wrong on our side.' })
  })
  return app
}

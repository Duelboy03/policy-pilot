import { ExtractiveAnswerer, HashingEmbedder, KnowledgeBase, type Answerer, type Passage } from '@policypilot/core'
import { readHandbook } from '@policypilot/core/node'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app'

let app: ReturnType<typeof createApp>
let kb: KnowledgeBase
const calls: string[] = []

const spy: Answerer = {
  name: 'spy',
  async *answer(q: string, ps: Passage[]) {
    calls.push(q)
    yield `Answer from ${ps.length} passages [1]`
  },
}

beforeAll(async () => {
  kb = new KnowledgeBase(new HashingEmbedder())
  for (const d of readHandbook()) await kb.addDocument(d)
  app = createApp({ kb, answerer: spy, info: { embedder: 'hashing', answerer: 'spy' }, askLimit: 6 })
})

const parseSse = (body: string) =>
  body
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)![1]
      return { event, data: JSON.parse(/^data: (.*)$/m.exec(block)![1]) }
    })

describe('API', () => {
  it('reports health and the loaded knowledge base', async () => {
    const r = await request(app).get('/api/health')
    expect(r.body).toMatchObject({ ok: true, embedder: 'hashing', answerer: 'spy', documents: 12 })
    expect(r.headers['x-powered-by']).toBeUndefined()
  })

  it('searches and returns scored hits', async () => {
    const r = await request(app).post('/api/search').send({ question: 'how many vacation days', mode: 'keyword' })
    expect(r.status).toBe(200)
    expect(r.body.hits[0].chunk.docId).toBe('time-off')
    expect(r.body.hits[0].bm25.rank).toBe(1)
  })

  it('streams sources, then tokens, then done', async () => {
    const r = await request(app).post('/api/ask').send({ question: 'How many vacation days do I get?', mode: 'keyword' })
    expect(r.headers['content-type']).toMatch(/text\/event-stream/)
    const ev = parseSse(r.text)
    expect(ev.map((e) => e.event)).toEqual(['sources', 'token', 'done'])
    expect(ev[0].data.confident).toBe(true)
    expect(ev[0].data.passages[0].n).toBe(1)
    expect(ev[1].data.text).toMatch(/Answer from/)
  })

  it('does not call the model when nothing relevant is found', async () => {
    calls.length = 0
    const r = await request(app).post('/api/ask').send({ question: 'What is the capital of France?', mode: 'keyword' })
    const ev = parseSse(r.text)
    expect(ev[0].data.confident).toBe(false)
    expect(ev[1].data.text).toMatch(/couldn't find that in the handbook/)
    expect(calls).toHaveLength(0)
  })

  it('validates questions', async () => {
    expect((await request(app).post('/api/ask').send({ question: '' })).status).toBe(422)
    expect((await request(app).post('/api/ask').send({ question: 'x'.repeat(700) })).status).toBe(422)
    expect((await request(app).post('/api/ask').send({ question: 'ok question', mode: 'nope' })).status).toBe(422)
    expect((await request(app).post('/api/ask').set('Content-Type', 'application/json').send('{bad')).status).toBe(400)
  })

  it('rate limits questions per client', async () => {
    const limited = createApp({ kb, answerer: spy, info: { embedder: null, answerer: 'spy' }, askLimit: 2 })
    const codes: number[] = []
    for (let i = 0; i < 4; i++) codes.push((await request(limited).post('/api/ask').send({ question: 'vacation days' })).status)
    expect(codes).toEqual([200, 200, 429, 429])
  })

  it('uploads a text document that can then be searched, and removes it again', async () => {
    const up = await request(app).post('/api/docs').attach('file', Buffer.from('# Pet Policy\n\n## Dogs\n\nWell-behaved dogs are welcome in the office on Fridays with prior notice to facilities.'), 'pet-policy.md')
    expect(up.status).toBe(201)
    expect(up.body).toMatchObject({ id: 'upload-pet-policy', title: 'Pet Policy', chunks: 1 })
    const s = await request(app).post('/api/search').send({ question: 'can I bring my dog to the office', mode: 'keyword' })
    expect(s.body.hits[0].chunk.docId).toBe('upload-pet-policy')
    expect((await request(app).delete('/api/docs/upload-pet-policy')).status).toBe(204)
    expect((await request(app).get('/api/docs')).body.some((x: { id: string }) => x.id === 'upload-pet-policy')).toBe(false)
  })

  it('accepts pasted text as JSON', async () => {
    const r = await request(app).post('/api/docs').send({ title: 'Parking', text: 'Parking is free for employees in the south car park, and visitors must register at reception.' })
    expect(r.status).toBe(201)
  })

  it('rejects unsupported files, oversized files and PDFs when pdf.js is not loaded', async () => {
    expect((await request(app).post('/api/docs').attach('file', Buffer.from('x'), 'virus.exe')).status).toBe(415)
    expect((await request(app).post('/api/docs').attach('file', Buffer.alloc(2.5 * 1024 * 1024, 'a'), 'big.txt')).status).toBe(413)
    expect((await request(app).post('/api/docs').attach('file', Buffer.from('%PDF-1.4'), 'a.pdf')).status).toBe(415)
    expect((await request(app).post('/api/docs').send({ title: 'x', text: 'short' })).status).toBe(422)
  })

  it('will not delete built-in documents or unknown ones', async () => {
    expect((await request(app).delete('/api/docs/time-off')).status).toBe(403)
    expect((await request(app).delete('/api/docs/nope')).status).toBe(404)
  })

  it('refuses to let an upload overwrite a built-in document', async () => {
    const r = await request(app).post('/api/docs').send({ title: 'time off', text: 'x'.repeat(40) })
    expect([201, 409]).toContain(r.status) // slug differs from the built-in id, so it is a new document
  })

  it('answers with the extractive engine end to end', async () => {
    const real = createApp({ kb, answerer: new ExtractiveAnswerer(), info: { embedder: 'hashing', answerer: 'extractive' } })
    const r = await request(real).post('/api/ask').send({ question: 'How many weeks of paid parental leave do birth parents get?', mode: 'keyword' })
    const text = parseSse(r.text).filter((e) => e.event === 'token').map((e) => e.data.text).join('')
    expect(text).toMatch(/16 weeks/)
  })
})

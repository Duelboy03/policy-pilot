import { describe, expect, it, vi } from 'vitest'
import { collect, ExtractiveAnswerer, NO_ANSWER, type Answerer } from './answer'
import { ask, type AskEvent } from './ask'
import { evaluateAnswers, type EvalCase } from './eval'
import { KnowledgeBase } from './kb'
import { pdfToPages, slug, titleFromFilename, type PdfJsLike } from './pdf'

async function kb() {
  const k = new KnowledgeBase(null)
  await k.addDocument({ id: 'pto', title: 'Paid Time Off', text: '# Paid Time Off\n\n## Vacation allowance\n\nFull-time employees receive 20 vacation days per year.' })
  return k
}
const events = async (g: AsyncGenerator<AskEvent>) => {
  const out: AskEvent[] = []
  for await (const e of g) out.push(e)
  return out
}

describe('ask', () => {
  it('emits sources, then the answer, then done', async () => {
    const ev = await events(ask(await kb(), new ExtractiveAnswerer(), 'How many vacation days do I get?', { mode: 'keyword' }))
    expect(ev.map((e) => e.type)).toEqual(['sources', 'token', 'done'])
    const sources = ev[0] as Extract<AskEvent, { type: 'sources' }>
    expect(sources.confident).toBe(true)
    expect(sources.passages[0].n).toBe(1)
  })

  it('never calls the answerer when the question is out of scope', async () => {
    const answer = vi.fn()
    const spy: Answerer = { name: 'spy', answer: answer as never }
    const ev = await events(ask(await kb(), spy, 'What is the capital of France?', { mode: 'keyword' }))
    expect(answer).not.toHaveBeenCalled()
    expect(ev.filter((e) => e.type === 'token').map((e) => (e as { text: string }).text)).toEqual([NO_ANSWER])
  })
})

describe('answer-level evaluation', () => {
  const cases: EvalCase[] = [
    { kind: 'direct', question: 'How many vacation days do I get?', fact: '20 vacation days' },
    { kind: 'direct', question: 'How many vacation days do I get?', fact: 'forty-two' },
    { kind: 'out-of-scope', question: 'What is the capital of France?' },
  ]
  it('measures whether the expected fact is in the answer and whether unanswerable questions are declined', async () => {
    const r = await evaluateAnswers(await kb(), new ExtractiveAnswerer(), cases, 'keyword')
    expect(r.n).toBe(2)
    expect(r.factRecall).toBe(0.5)
    expect(r.declined).toBe(1)
    expect(r.misses).toHaveLength(1)
  })
})

describe('PDF text extraction', () => {
  const fake = (pages: { str?: string; hasEOL?: boolean }[][]): PdfJsLike => ({
    getDocument: () => ({ promise: Promise.resolve({ numPages: pages.length, getPage: async (n: number) => ({ getTextContent: async () => ({ items: pages[n - 1] }) }) }) }),
  })
  it('joins text items, keeps line breaks and drops empty pages', async () => {
    const pages = await pdfToPages(fake([[{ str: 'Hello', hasEOL: false }, { str: 'world', hasEOL: true }, { str: 'Second line', hasEOL: true }], [], [{ str: 'Page three' }]]), new Uint8Array())
    expect(pages).toEqual(['Hello world\nSecond line', 'Page three'])
  })
  it('turns file names into titles and ids', () => {
    expect(titleFromFilename('leave-policy_v2.pdf')).toBe('Leave policy v2')
    expect(titleFromFilename('.pdf')).toBe('Untitled document')
    expect(slug('Pet Policy (2026)!')).toBe('pet-policy-2026')
    expect(slug('!!!')).toBe('doc')
  })
  it('collect joins a stream', async () => {
    expect(await collect((async function* () { yield 'a'; yield 'b' })())).toBe('ab')
  })
})

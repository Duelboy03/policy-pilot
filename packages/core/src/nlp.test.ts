import { describe, expect, it } from 'vitest'
import { Bm25Index } from './bm25'
import { chunkDocument, sentences } from './chunk'
import { HashingEmbedder } from './embed'
import { stem, tokenize, words } from './tokenize'
import { dot, reciprocalRankFusion, topK } from './vector'

describe('tokenizer', () => {
  it('keeps 401(k) and W-4 as single tokens and drops stop words', () => {
    expect(words('Your 401(k) and W-4, please!')).toEqual(['your', '401k', 'and', 'w4', 'please'])
    expect(tokenize('How many days of vacation do I get?')).toEqual(['day', 'vacation'])
    expect(tokenize('What is the 401(k) match?')).toEqual(['401k', 'match'])
  })
  it('conflates the word forms that appear in policy text', () => {
    const same = (...ws: string[]) => expect(new Set(ws.map(stem)).size).toBe(1)
    same('approve', 'approved', 'approves', 'approving')
    same('expense', 'expenses')
    same('accrue', 'accrues', 'accrued', 'accrual')
    same('reimburse', 'reimbursed', 'reimbursement')
    same('request', 'requests', 'requested')
  })
  it('leaves short words and numbers alone', () => {
    expect(stem('pay')).toBe('pay')
    expect(stem('2500')).toBe('2500')
  })
})

describe('BM25', () => {
  const idx = new Bm25Index([
    { id: 'a', tokens: ['vacation', 'day', 'accru', 'month'] },
    { id: 'b', tokens: ['sick', 'day', 'doctor', 'note'] },
    { id: 'c', tokens: ['expens', 'receipt', 'manager', 'approv', 'receipt'] },
  ])
  it('ranks the document containing the rarer query term first', () => {
    expect(idx.search(['vacation', 'day'])[0].id).toBe('a')
    expect(idx.search(['doctor', 'day'])[0].id).toBe('b')
  })
  it('gives rare terms more weight than common ones', () => {
    expect(idx.idf('vacation')).toBeGreaterThan(idx.idf('day'))
  })
  it('returns nothing when no query term occurs', () => {
    expect(idx.search(['zebra'])).toEqual([])
  })
  it('rewards repeated terms, with diminishing returns', () => {
    const one = idx.search(['receipt'])[0]
    expect(one.id).toBe('c')
    expect(one.score).toBeGreaterThan(0)
  })
  it('ignores duplicate query terms', () => {
    expect(idx.search(['vacation', 'vacation'])[0].score).toBeCloseTo(idx.search(['vacation'])[0].score)
  })
})

describe('chunking', () => {
  const md = `# Policy

Intro text that belongs to no section.

## Vacation

Employees get 20 days. They accrue at 1.67 days a month. The cap is 30 days.

## Sick

- Item one
- Item two

### Doctor's notes

A note is needed after 3 days.
`
  it('splits by heading and records the heading path', () => {
    const c = chunkDocument({ id: 'p', title: 'Policy', text: md })
    expect(c.map((x) => x.heading)).toEqual(['', 'Vacation', 'Sick', 'Sick › Doctor\'s notes'])
    expect(c[1].id).toBe('p#1')
    expect(c[1].embedText.startsWith('Policy — Vacation\n')).toBe(true)
  })
  it('does not split a decimal number into two sentences', () => {
    expect(sentences('They accrue at 1.67 days a month. The cap is 30 days.')).toEqual(['They accrue at 1.67 days a month.', 'The cap is 30 days.'])
  })
  it('keeps list items as separate sentences', () => {
    expect(sentences('- One\n- Two')).toEqual(['- One', '- Two'])
  })
  it('splits an oversized section on sentence boundaries with overlap', () => {
    const body = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} has exactly eight words in it.`).join(' ')
    const c = chunkDocument({ id: 'd', title: 'D', text: `# D\n\n## Long\n\n${body}` }, { targetWords: 60, maxWords: 80, overlapSentences: 1 })
    expect(c.length).toBeGreaterThan(3)
    for (const x of c) expect(x.text.split(/\s+/).length).toBeLessThanOrEqual(80)
    // overlap: the last sentence of one chunk opens the next
    const lastOfFirst = c[0].text.match(/Sentence number \d+ has exactly eight words in it\./g)!.at(-1)!
    expect(c[1].text.startsWith(lastOfFirst)).toBe(true)
    // nothing is lost
    for (let i = 0; i < 40; i++) expect(c.some((x) => x.text.includes(`Sentence number ${i} `))).toBe(true)
  })
  it('chunks pages separately and keeps the page number', () => {
    const c = chunkDocument({ id: 'pdf', title: 'PDF', text: '', pages: ['First page text.', 'Second page text.'] })
    expect(c.map((x) => x.page)).toEqual([1, 2])
  })
  it('handles plain text with no headings', () => {
    const c = chunkDocument({ id: 't', title: 'T', text: 'Just some text.\n\nAnd more.' })
    expect(c).toHaveLength(1)
    expect(c[0].heading).toBe('')
  })
})

describe('vectors and fusion', () => {
  it('hashing embeddings are deterministic, normalised and reflect shared vocabulary', async () => {
    const e = new HashingEmbedder(128)
    const [a, b, c, a2] = await e.embed(['vacation days accrue monthly', 'vacation days per month', 'expense receipt approval', 'vacation days accrue monthly'])
    expect(dot(a, a)).toBeCloseTo(1)
    expect(Array.from(a)).toEqual(Array.from(a2))
    expect(dot(a, b)).toBeGreaterThan(dot(a, c))
  })
  it('topK returns the nearest vectors first', async () => {
    const e = new HashingEmbedder(128)
    const vs = await e.embed(['sick leave doctor', 'vacation accrual', 'travel per diem'])
    const [q] = await e.embed(['how much vacation accrues'])
    expect(topK(q, vs, ['sick', 'vac', 'travel'], 2)[0].id).toBe('vac')
  })
  it('reciprocal rank fusion rewards agreement between lists', () => {
    const fused = reciprocalRankFusion([['a', 'b', 'c'], ['c', 'a', 'd']])
    const order = [...fused.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id)
    expect(order.slice(0, 2).sort()).toEqual(['a', 'c'])
    expect(fused.get('a')).toBeCloseTo(1 / 61 + 1 / 62)
  })
  it('weights shift the balance toward one retriever', () => {
    const lists = [['x', 'y'], ['y', 'x']]
    expect(reciprocalRankFusion(lists, 60, [3, 1]).get('x')!).toBeGreaterThan(reciprocalRankFusion(lists, 60, [3, 1]).get('y')!)
    expect(reciprocalRankFusion(lists, 60, [1, 3]).get('y')!).toBeGreaterThan(reciprocalRankFusion(lists, 60, [1, 3]).get('x')!)
  })
})

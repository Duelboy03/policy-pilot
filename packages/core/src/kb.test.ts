import { describe, expect, it } from 'vitest'
import { HashingEmbedder } from './embed'
import { evaluate, type EvalCase } from './eval'
import { KnowledgeBase } from './kb'
import type { DocInput } from './types'

const docs: DocInput[] = [
  { id: 'pto', title: 'Paid Time Off', text: '# Paid Time Off\n\n## Vacation allowance\n\nFull-time employees receive 20 vacation days per year. Vacation accrues monthly.\n\n## Carry-over\n\nUp to 5 unused vacation days carry over into the next year.' },
  { id: 'exp', title: 'Expenses', text: '# Expenses\n\n## Submitting expenses\n\nSubmit each expense claim within 30 days with a receipt for anything over $25.\n\n## Approvals\n\nYour manager approves claims up to $500.' },
  { id: 'sick', title: 'Sick Leave', text: "# Sick Leave\n\n## Doctor's notes\n\nA doctor's note is needed only after 3 consecutive working days of sickness." },
]

async function build(embedder: HashingEmbedder | null) {
  const kb = new KnowledgeBase(embedder)
  for (const d of docs) await kb.addDocument(d)
  return kb
}

describe('KnowledgeBase', () => {
  it('indexes documents and lists them with their chunk counts', async () => {
    const kb = await build(null)
    expect(kb.documents.map((d) => [d.id, d.chunks])).toEqual([['pto', 2], ['exp', 2], ['sick', 1]])
    expect(kb.chunkCount).toBe(5)
  })

  it('keyword search finds the right section and explains itself', async () => {
    const kb = await build(null)
    const r = await kb.search('How many vacation days do I get?', { mode: 'keyword' })
    expect(r.mode).toBe('keyword')
    expect(r.hits[0].chunk.heading).toBe('Vacation allowance')
    expect(r.hits[0].bm25?.rank).toBe(1)
    expect(r.hits[0].coverage).toBe(1)
    expect(r.confident).toBe(true)
  })

  it('falls back to keyword search when there are no embeddings, rather than failing', async () => {
    const kb = await build(null)
    expect((await kb.search('doctor note', { mode: 'semantic' })).mode).toBe('keyword')
    expect((await kb.search('doctor note', { mode: 'hybrid' })).mode).toBe('keyword')
  })

  it('semantic and hybrid search work once an embedder is set', async () => {
    const kb = await build(new HashingEmbedder())
    for (const mode of ['semantic', 'hybrid'] as const) {
      const r = await kb.search('when is a doctor note required', { mode })
      expect(r.mode).toBe(mode)
      expect(r.hits[0].chunk.docId).toBe('sick')
      expect(r.hits[0].dense?.rank).toBe(1)
    }
    const h = await kb.search('vacation carry over', { mode: 'hybrid' })
    expect(h.hits[0].bm25).toBeDefined()
    expect(h.hits[0].dense).toBeDefined()
  })

  it('declines when nothing in the handbook matches', async () => {
    const kb = await build(null)
    expect((await kb.search('capital of France', { mode: 'keyword' })).confident).toBe(false)
    expect((await kb.search('', { mode: 'keyword' })).confident).toBe(false)
  })

  it('removes a document and its vectors, and replaces one with the same id', async () => {
    const kb = await build(new HashingEmbedder())
    kb.removeDocument('exp')
    expect(kb.documents.map((d) => d.id)).toEqual(['pto', 'sick'])
    expect((await kb.search('expense receipt', { mode: 'semantic' })).hits.every((h) => h.chunk.docId !== 'exp')).toBe(true)
    await kb.addDocument({ id: 'sick', title: 'Sick Leave', text: '# Sick Leave\n\n## New\n\nBrand new text about parental bonding.' })
    expect(kb.documents.find((d) => d.id === 'sick')?.chunks).toBe(1)
    expect((await kb.search('parental bonding', { mode: 'keyword' })).hits[0].chunk.heading).toBe('New')
  })

  it('swaps the embedder and re-embeds everything, reporting progress', async () => {
    const kb = await build(null)
    const seen: number[] = []
    await kb.setEmbedder(new HashingEmbedder(), (done) => seen.push(done))
    expect(kb.hasVectors).toBe(true)
    expect(seen.at(-1)).toBe(5)
    await kb.setEmbedder(null)
    expect(kb.hasVectors).toBe(false)
  })

  it('round-trips through export and import, reusing vectors from the same embedder only', async () => {
    const kb = await build(new HashingEmbedder())
    const state = JSON.parse(JSON.stringify(kb.exportState()))
    const same = new KnowledgeBase(new HashingEmbedder())
    same.importState(state)
    expect(same.hasVectors).toBe(true)
    expect((await same.search('vacation days', { mode: 'semantic' })).hits[0].chunk.docId).toBe('pto')
    const other = new KnowledgeBase(null)
    other.importState(state)
    expect(other.hasVectors).toBe(false)
    expect(other.chunkCount).toBe(5)
  })

  it('reuses imported vectors when an embedder with the same name is attached later', async () => {
    const state = JSON.parse(JSON.stringify((await build(new HashingEmbedder())).exportState()))
    const kb = new KnowledgeBase(null)
    kb.importState(state)
    expect(kb.hasVectors).toBe(false)
    let calls = 0
    const counting = new HashingEmbedder()
    const embed = counting.embed.bind(counting)
    counting.embed = async (t: string[]) => {
      calls += t.length
      return embed(t)
    }
    await kb.setEmbedder(counting)
    expect(kb.hasVectors).toBe(true)
    expect(calls).toBe(0) // nothing was re-embedded
    await kb.addDocument({ id: 'u', title: 'U', text: '# U\n\n## A\n\nA brand new uploaded policy about parking spaces.' })
    expect(calls).toBe(1) // only the new chunk
  })

  it('chunks added later are embedded automatically', async () => {
    const kb = await build(new HashingEmbedder())
    await kb.addDocument({ id: 'x', title: 'X', text: '# X\n\n## Gym\n\nThe gym stipend is $50 a month.' })
    expect(kb.hasVectors).toBe(true)
    expect((await kb.search('gym stipend', { mode: 'semantic' })).hits[0].chunk.docId).toBe('x')
  })
})

describe('evaluation harness', () => {
  const cases: EvalCase[] = [
    { kind: 'direct', question: 'How many vacation days do I get?', doc: 'pto', heading: 'Vacation allowance' },
    { kind: 'direct', question: 'Who approves expense claims?', doc: 'exp', heading: 'Approvals' },
    { kind: 'direct', question: 'Where is the answer that does not exist?', doc: 'sick', heading: 'Nonexistent heading' },
    { kind: 'out-of-scope', question: 'What is the capital of France?' },
  ]
  it('computes hit rates, MRR and abstention', async () => {
    const kb = await build(null)
    const r = await evaluate(kb, cases, 'keyword')
    expect(r.cases).toBe(4)
    expect(r.hitAt1).toBeCloseTo(2 / 3)
    expect(r.hitAt5).toBeCloseTo(2 / 3)
    expect(r.mrr).toBeCloseTo(2 / 3)
    expect(r.abstainAccuracy).toBe(1)
    expect(r.byKind.direct.n).toBe(3)
    expect(r.results[2].rank).toBeNull()
  })
})

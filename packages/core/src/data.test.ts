import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EVAL_CASES, HANDBOOK } from './data'
import { evaluate } from './eval'
import { KnowledgeBase } from './kb'
import { DATA_DIR, hashDocs, readHandbook } from './node'

describe('bundled handbook index', () => {
  const docs = readHandbook()

  it('is up to date with the markdown files (run `npm run build:index` if this fails)', () => {
    expect(HANDBOOK.hash).toBe(hashDocs(docs))
    expect(HANDBOOK.docs.map((d) => d.id)).toEqual(docs.map((d) => d.id))
  })

  it('has one embedding per chunk', () => {
    expect(HANDBOOK.chunks.length).toBeGreaterThan(50)
    expect(HANDBOOK.vectors).toHaveLength(HANDBOOK.chunks.length)
    expect(HANDBOOK.vectors![0]).toHaveLength(384)
    expect(HANDBOOK.embedder).toBe('minilm-l6-v2')
  })

  it('every evaluation question points at a section that exists', () => {
    for (const c of EVAL_CASES.filter((x) => x.kind !== 'out-of-scope')) {
      expect(HANDBOOK.chunks.some((k) => k.docId === c.doc && k.heading.toLowerCase().includes(c.heading!.toLowerCase())), c.question).toBe(true)
    }
  })

  it('keyword search alone answers most direct questions (regression guard, needs no model)', async () => {
    const kb = new KnowledgeBase(null)
    for (const d of docs) await kb.addDocument(d)
    const r = await evaluate(kb, EVAL_CASES, 'keyword')
    expect(r.byKind.direct.hitAt3).toBeGreaterThanOrEqual(0.8)
    expect(r.abstainAccuracy).toBeGreaterThanOrEqual(0.7)
  })

  it('stored evaluation results match what the README reports', () => {
    const { retrieval: results } = JSON.parse(readFileSync(join(DATA_DIR, '..', 'eval', 'results.json'), 'utf8')) as { retrieval: { label: string; hitAt3: number }[] }
    expect(results.map((r) => r.label)).toContain('Semantic (MiniLM)')
    expect(results.find((r) => r.label === 'Semantic (MiniLM)')!.hitAt3).toBeGreaterThan(0.9)
  })
})

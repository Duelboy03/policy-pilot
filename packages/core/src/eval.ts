import { collect, type Answerer } from './answer'
import { ask } from './ask'
import type { KnowledgeBase } from './kb'
import type { RetrievalMode } from './types'

export interface EvalCase {
  question: string
  /** document that holds the answer; absent for out-of-scope questions */
  doc?: string
  /** a fragment of the heading of the section that holds the answer */
  heading?: string
  kind: 'direct' | 'paraphrase' | 'out-of-scope'
  /** a short phrase that a correct answer must contain (compared case-insensitively) */
  fact?: string
}

export interface CaseResult {
  question: string
  kind: EvalCase['kind']
  /** 1-based rank of the first relevant chunk, or null if it was not retrieved */
  rank: number | null
  confident: boolean
}

export interface ModeReport {
  mode: RetrievalMode
  cases: number
  hitAt1: number
  hitAt3: number
  hitAt5: number
  mrr: number
  /** share of out-of-scope questions correctly declined */
  abstainAccuracy: number
  /** share of answerable questions wrongly declined */
  falseAbstain: number
  byKind: Record<'direct' | 'paraphrase', { hitAt1: number; hitAt3: number; n: number }>
  results: CaseResult[]
}

const isRelevant = (c: EvalCase, chunk: { docId: string; heading: string }) =>
  !!c.doc && chunk.docId === c.doc && (!c.heading || chunk.heading.toLowerCase().includes(c.heading.toLowerCase()))

export async function evaluate(kb: KnowledgeBase, cases: EvalCase[], mode: RetrievalMode, k = 5): Promise<ModeReport> {
  const results: CaseResult[] = []
  for (const c of cases) {
    const r = await kb.search(c.question, { mode, k })
    const idx = r.hits.findIndex((h) => isRelevant(c, h.chunk))
    results.push({ question: c.question, kind: c.kind, rank: idx >= 0 ? idx + 1 : null, confident: r.confident })
  }
  const answerable = results.filter((r) => r.kind !== 'out-of-scope')
  const oos = results.filter((r) => r.kind === 'out-of-scope')
  const at = (n: number, rs = answerable) => (rs.length ? rs.filter((r) => r.rank !== null && r.rank <= n).length / rs.length : 0)
  const kind = (kd: 'direct' | 'paraphrase') => {
    const rs = answerable.filter((r) => r.kind === kd)
    return { hitAt1: at(1, rs), hitAt3: at(3, rs), n: rs.length }
  }
  return {
    mode,
    cases: results.length,
    hitAt1: at(1),
    hitAt3: at(3),
    hitAt5: at(5),
    mrr: answerable.length ? answerable.reduce((a, r) => a + (r.rank ? 1 / r.rank : 0), 0) / answerable.length : 0,
    abstainAccuracy: oos.length ? oos.filter((r) => !r.confident).length / oos.length : 1,
    falseAbstain: answerable.length ? answerable.filter((r) => !r.confident).length / answerable.length : 0,
    byKind: { direct: kind('direct'), paraphrase: kind('paraphrase') },
    results,
  }
}

export interface AnswerReport {
  /** answerable questions whose answer contained the expected fact */
  factRecall: number
  n: number
  /** out-of-scope questions answered with the standard "not found" message */
  declined: number
  misses: { question: string; answer: string }[]
}

/**
 * Answer-level evaluation: run the whole RAG loop and check that the expected fact appears in the answer.
 * This is a coarse but honest check; it does not judge fluency or catch extra wrong claims.
 */
export async function evaluateAnswers(kb: KnowledgeBase, answerer: Answerer, cases: EvalCase[], mode: RetrievalMode = 'semantic'): Promise<AnswerReport> {
  let hit = 0
  let n = 0
  let oos = 0
  let declined = 0
  const misses: AnswerReport['misses'] = []
  for (const c of cases) {
    const stream = (async function* () {
      for await (const ev of ask(kb, answerer, c.question, { mode })) if (ev.type === 'token') yield ev.text
    })()
    const text = await collect(stream)
    if (c.kind === 'out-of-scope') {
      oos++
      if (/couldn't find that in the handbook/i.test(text)) declined++
    } else if (c.fact) {
      n++
      if (text.toLowerCase().includes(c.fact.toLowerCase())) hit++
      else misses.push({ question: c.question, answer: text })
    }
  }
  return { factRecall: n ? hit / n : 0, n, declined: oos ? declined / oos : 1, misses }
}

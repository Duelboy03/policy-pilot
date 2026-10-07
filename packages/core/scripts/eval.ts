import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClaudeAnswerer, evaluate, evaluateAnswers, ExtractiveAnswerer, HashingEmbedder, KnowledgeBase, type AnswerReport, type EvalCase, type ModeReport } from '../src'
import { DATA_DIR, readHandbook } from '../src/node'
import { createTransformersEmbedder } from '../src/transformers'

const cases = JSON.parse(readFileSync(join(DATA_DIR, 'eval.json'), 'utf8')) as EvalCase[]
const docs = readHandbook()

async function kbWith(embedder: Parameters<typeof KnowledgeBase.prototype.setEmbedder>[0]) {
  const kb = new KnowledgeBase(embedder)
  for (const d of docs) await kb.addDocument(d)
  return kb
}

const neural = await createTransformersEmbedder({})
const setups: { label: string; kb: KnowledgeBase; mode: 'keyword' | 'semantic' | 'hybrid' }[] = [
  { label: 'Keyword (BM25)', kb: await kbWith(null), mode: 'keyword' },
  { label: 'Semantic (hashing baseline)', kb: await kbWith(new HashingEmbedder()), mode: 'semantic' },
  { label: 'Semantic (MiniLM)', kb: await kbWith(neural), mode: 'semantic' },
  { label: 'Hybrid (BM25 + MiniLM, RRF)', kb: await kbWith(neural), mode: 'hybrid' },
]

const reports: (ModeReport & { label: string })[] = []
for (const s of setups) reports.push({ label: s.label, ...(await evaluate(s.kb, cases, s.mode)) })

const pct = (x: number) => `${(x * 100).toFixed(0)}%`
const answerable = cases.filter((c) => c.kind !== 'out-of-scope').length
console.log(`\n${answerable} answerable questions (${reports[0].byKind.direct.n} direct, ${reports[0].byKind.paraphrase.n} paraphrased) and ${cases.length - answerable} out of scope\n`)
console.log('| Retriever | Hit@1 | Hit@3 | Hit@5 | MRR | Direct Hit@3 | Paraphrase Hit@3 | Declines out-of-scope | Wrongly declines |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const r of reports)
  console.log(`| ${r.label} | ${pct(r.hitAt1)} | ${pct(r.hitAt3)} | ${pct(r.hitAt5)} | ${r.mrr.toFixed(2)} | ${pct(r.byKind.direct.hitAt3)} | ${pct(r.byKind.paraphrase.hitAt3)} | ${pct(r.abstainAccuracy)} | ${pct(r.falseAbstain)} |`)

const hybrid = reports[reports.length - 1]
console.log('\nHybrid misses (not in top 5):')
for (const r of hybrid.results.filter((x) => x.kind !== 'out-of-scope' && x.rank === null)) console.log(`  - ${r.question}`)
console.log('Hybrid rank > 1:')
for (const r of hybrid.results.filter((x) => x.kind !== 'out-of-scope' && x.rank && x.rank > 1)) console.log(`  - [${r.rank}] ${r.question}`)
console.log('Out-of-scope answered confidently (hybrid):')
for (const r of hybrid.results.filter((x) => x.kind === 'out-of-scope' && x.confident)) console.log(`  - ${r.question}`)
console.log('Answerable but declined (hybrid):')
for (const r of hybrid.results.filter((x) => x.kind !== 'out-of-scope' && !x.confident)) console.log(`  - ${r.question}`)

// ---- answer level: does the final answer contain the expected fact?
const answerKb = setups[2].kb
const answerers: { label: string; run: () => Promise<AnswerReport> }[] = [
  { label: 'Extractive, keyword overlap', run: () => evaluateAnswers(answerKb, new ExtractiveAnswerer(), cases) },
  { label: 'Extractive, semantic sentence ranking', run: () => evaluateAnswers(answerKb, new ExtractiveAnswerer({ embedder: neural }), cases) },
]
if (process.env.ANTHROPIC_API_KEY) {
  const claude = new ClaudeAnswerer({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.CLAUDE_MODEL, baseUrl: process.env.ANTHROPIC_BASE_URL })
  answerers.push({ label: `Claude (${process.env.CLAUDE_MODEL ?? 'claude-sonnet-5-5'})`, run: () => evaluateAnswers(answerKb, claude, cases) })
} else console.log('\n(Set ANTHROPIC_API_KEY to include Claude in the answer-level comparison.)')

console.log('\n| Answer engine | Expected fact in answer | Declines out-of-scope |')
console.log('| --- | --- | --- |')
const answerReports: { label: string; factRecall: number; declined: number; n: number }[] = []
for (const a of answerers) {
  const r = await a.run()
  answerReports.push({ label: a.label, factRecall: r.factRecall, declined: r.declined, n: r.n })
  console.log(`| ${a.label} | ${pct(r.factRecall)} (${Math.round(r.factRecall * r.n)}/${r.n}) | ${pct(r.declined)} |`)
}

mkdirSync(join(DATA_DIR, '..', 'eval'), { recursive: true })
writeFileSync(
  join(DATA_DIR, '..', 'eval', 'results.json'),
  JSON.stringify({ retrieval: reports.map(({ results: _results, ...r }) => r), answers: answerReports }, null, 2),
)

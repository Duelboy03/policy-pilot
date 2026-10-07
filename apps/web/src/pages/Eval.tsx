import { evaluate, type EvalCase, type ModeReport, type RetrievalMode } from '@policypilot/core'
import { EVAL_CASES, EVAL_RESULTS } from '@policypilot/core/data'
import { CheckCircle2, Play, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useEngine, useEngineStatus } from '../hooks/app'
import { Badge, Button } from '../components/ui'

type Row = { label: string; hitAt1: number; hitAt3: number; hitAt5: number; mrr: number; abstainAccuracy: number; falseAbstain: number; paraphraseHit3: number }
const pct = (x: number) => `${Math.round(x * 100)}%`

const rows: Row[] = EVAL_RESULTS.retrieval.map((r) => ({
  label: r.label,
  hitAt1: r.hitAt1,
  hitAt3: r.hitAt3,
  hitAt5: r.hitAt5,
  mrr: r.mrr,
  abstainAccuracy: r.abstainAccuracy,
  falseAbstain: r.falseAbstain,
  paraphraseHit3: r.byKind.paraphrase.hitAt3,
}))

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="flex min-w-[7rem] items-center gap-2.5">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: tone }} /></div>
      <span className="w-10 text-right font-mono text-xs">{pct(value)}</span>
    </div>
  )
}

export function EvalPage() {
  const engine = useEngine()
  const status = useEngineStatus()
  const [live, setLive] = useState<Record<string, ModeReport> | null>(null)
  const [running, setRunning] = useState(false)
  const ready = status.neural.state === 'ready' || status.neural.state === 'off'
  const kb = engine.knowledgeBase?.()

  const run = async () => {
    if (!kb) return
    setRunning(true)
    const out: Record<string, ModeReport> = {}
    for (const mode of ['keyword', 'semantic', 'hybrid'] as RetrievalMode[]) {
      out[mode] = await evaluate(kb, EVAL_CASES as EvalCase[], mode)
      setLive({ ...out })
      await new Promise((r) => setTimeout(r, 0)) // let the page paint between modes
    }
    setRunning(false)
  }

  const modes: RetrievalMode[] = ['keyword', 'semantic', 'hybrid']
  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="font-serif text-3xl font-medium tracking-tight">Evaluation</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-sub">
        Retrieval quality is measured, not assumed. {EVAL_CASES.length} questions were written against the handbook: some reuse its wording, some are paraphrases that share almost no words with it, and some are about things the handbook does not cover. For each, the right section should come back near the top.
      </p>

      <div className="mt-7 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-line text-xs text-sub">
            <tr><th className="px-4 py-3 font-medium">Retriever</th><th className="px-4 py-3 font-medium">Right section in top 1</th><th className="px-4 py-3 font-medium">In top 3</th><th className="px-4 py-3 font-medium">Paraphrases, top 3</th><th className="px-4 py-3 text-right font-medium">MRR</th><th className="px-4 py-3 text-right font-medium">Declines unanswerable</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.label} className={r.label.startsWith('Semantic (MiniLM') ? 'bg-accent-soft/50' : ''}>
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3"><Bar value={r.hitAt1} tone="var(--info)" /></td>
                <td className="px-4 py-3"><Bar value={r.hitAt3} tone="var(--accent)" /></td>
                <td className="px-4 py-3"><Bar value={r.paraphraseHit3} tone="var(--good)" /></td>
                <td className="px-4 py-3 text-right font-mono text-xs">{r.mrr.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{pct(r.abstainAccuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">What the numbers say</h2>
          <ul className="mt-2.5 space-y-2 text-[13.5px] leading-relaxed text-sub">
            <li>Keyword search is fine when a question reuses the handbook's words (85% in the top 3) and fails on paraphrases (36%).</li>
            <li>The neural model gets paraphrases right (95%), and its similarity score is also what lets the assistant say "not in the handbook".</li>
            <li>Hybrid fusion scored lower than semantic alone here. Common words like "work" and "pay" make keyword results noisy, and rank-based fusion lets that noise outvote a correct semantic match. That is why semantic is the default.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Answers, not just retrieval</h2>
          <table className="mt-2.5 w-full text-[13.5px]">
            <tbody className="divide-y divide-line">
              {EVAL_RESULTS.answers.map((a) => (
                <tr key={a.label}><td className="py-2 pr-3 text-sub">{a.label}</td><td className="py-2 text-right font-mono">{pct(a.factRecall)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs leading-relaxed text-muted">Share of {EVAL_RESULTS.answers[0]?.n} answerable questions whose answer contains the expected fact (for example "16 weeks"). A coarse check: it does not penalise extra wrong claims. Claude is not in the table because no API key was used for these runs; run <code className="rounded bg-surface-2 px-1">ANTHROPIC_API_KEY=… npm run eval</code> to add it.</p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Run it here</h2>
        <Button variant="primary" onClick={run} disabled={!kb || !ready || running}><Play size={15} /> {running ? 'Running…' : 'Run on this browser'}</Button>
        {!kb && <Badge>Available in the local demo</Badge>}
        {kb && !ready && <Badge tone="accent">Waiting for the search model</Badge>}
        <p className="basis-full text-[13px] text-sub">Runs all {EVAL_CASES.length} questions through the retrieval code in this tab. Uploaded documents are included, so remove them first to compare with the table above.</p>
      </div>

      {live && (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface" data-testid="live-eval">
          <table className="w-full min-w-[44rem] text-left text-[13px]">
            <thead className="border-b border-line text-xs text-sub">
              <tr><th className="px-4 py-2.5 font-medium">Question</th>{modes.map((m) => <th key={m} className="px-3 py-2.5 text-center font-medium capitalize">{m}</th>)}</tr>
              <tr className="text-[11px]"><th className="px-4 pb-2 font-normal text-muted">Rank of the right section (– = not in top 5)</th>{modes.map((m) => <th key={m} className="px-3 pb-2 font-normal text-muted">{live[m] ? `top 3: ${pct(live[m].hitAt3)}` : '…'}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(EVAL_CASES as EvalCase[]).map((c, i) => (
                <tr key={c.question}>
                  <td className="px-4 py-2"><span className="text-ink">{c.question}</span> <Badge className="ml-1">{c.kind}</Badge></td>
                  {modes.map((m) => {
                    const r = live[m]?.results[i]
                    if (!r) return <td key={m} className="px-3 py-2 text-center text-muted">…</td>
                    if (c.kind === 'out-of-scope') return <td key={m} className="px-3 py-2 text-center">{r.confident ? <XCircle size={15} className="mx-auto text-bad" aria-label="answered although not covered" /> : <CheckCircle2 size={15} className="mx-auto text-good" aria-label="declined" />}</td>
                    return <td key={m} className="px-3 py-2 text-center font-mono text-xs">{r.rank === null ? <span className="text-bad">–</span> : <span className={r.rank === 1 ? 'text-good' : 'text-ink'}>#{r.rank}</span>}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

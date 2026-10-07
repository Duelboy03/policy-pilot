import { CONFIDENCE } from '@policypilot/core'
import type { Turn } from '../hooks/useChat'
import { Badge } from './ui'

const ms = (n?: number) => (n === undefined ? '–' : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`)

/** What happened to this question, step by step: useful for judging whether the answer can be trusted. */
export function Inspector({ turn }: { turn: Turn }) {
  const fell = turn.mode && turn.mode !== turn.requestedMode
  return (
    <div className="enter rounded-xl border border-line bg-surface-2/50 p-4 text-[13px]" data-testid="inspector">
      <ol className="space-y-3">
        <li>
          <p className="font-medium">1. Retrieve <span className="font-normal text-sub">· {ms(turn.retrievalMs)}</span></p>
          <p className="mt-1 text-sub">
            Searched with <b className="text-ink">{turn.mode ?? '…'}</b> retrieval.
            {fell && <> You asked for {turn.requestedMode}, but the search model was not ready, so this fell back to keyword search.</>}
          </p>
        </li>
        <li>
          <p className="font-medium">2. Check relevance</p>
          <p className="mt-1 text-sub">
            {turn.confident
              ? 'The top passage is similar enough to the question to answer from.'
              : `Nothing scored high enough (a semantic match needs ${CONFIDENCE.denseMin.toFixed(2)}+), so the assistant declines instead of guessing.`}
          </p>
        </li>
        <li>
          <p className="font-medium">3. Answer <span className="font-normal text-sub">· first words {ms(turn.firstTokenMs)}, total {ms(turn.totalMs)}</span></p>
          <p className="mt-1 text-sub">
            {turn.confident ? (turn.answerer === 'claude' ? 'Claude wrote the answer using only the numbered passages, and was told to cite each claim.' : 'The extractive engine picked the sentences that best match the question and quoted them. No language model was used.') : 'No model was called.'}
          </p>
        </li>
      </ol>
      {turn.passages.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-xs">
            <thead className="text-sub"><tr><th className="pb-1.5 font-medium">#</th><th className="pb-1.5 font-medium">Passage</th><th className="pb-1.5 text-right font-medium">Keyword</th><th className="pb-1.5 text-right font-medium">Semantic</th><th className="pb-1.5 text-right font-medium">Words matched</th></tr></thead>
            <tbody className="divide-y divide-line">
              {turn.passages.map((p) => (
                <tr key={p.n}>
                  <td className="py-1.5 font-mono text-accent">{p.n}</td>
                  <td className="py-1.5 pr-3">{p.hit.chunk.docTitle} <span className="text-sub">› {p.hit.chunk.heading || 'whole document'}</span></td>
                  <td className="py-1.5 text-right font-mono text-sub">{p.hit.bm25 ? `#${p.hit.bm25.rank} · ${p.hit.bm25.score.toFixed(1)}` : <Badge>not in top 20</Badge>}</td>
                  <td className="py-1.5 text-right font-mono text-sub">{p.hit.dense ? `${p.hit.dense.score.toFixed(3)}` : '–'}</td>
                  <td className="py-1.5 text-right font-mono text-sub">{Math.round(p.hit.coverage * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

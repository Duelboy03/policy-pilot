import type { Hit, Passage } from '@policypilot/core'
import { ChevronDown, FileText } from 'lucide-react'
import { forwardRef, useState } from 'react'
import { highlight } from '../lib/text'
import { Badge, cn } from './ui'

const clamp = 260

export const SourceCard = forwardRef<HTMLDivElement, { passage: Passage; question: string; flashing: boolean }>(function SourceCard({ passage, question, flashing }, ref) {
  const [open, setOpen] = useState(false)
  const c = passage.hit.chunk
  const long = c.text.length > clamp
  const text = open || !long ? c.text : `${c.text.slice(0, clamp).replace(/\s+\S*$/, '')}…`
  return (
    <div ref={ref} id={`src-${passage.n}`} className={cn('rounded-xl border border-line bg-surface p-3.5 transition-colors', flashing && 'flash')}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent-soft text-xs font-bold text-accent">{passage.n}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium">
            <FileText size={13} className="shrink-0 text-sub" />
            <span>{c.docTitle}</span>
            {c.heading && <span className="text-sub">› {c.heading}</span>}
            {c.page && <span className="text-sub">· page {c.page}</span>}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-sub">{highlight(text, question)}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Chips hit={passage.hit} />
            {long && (
              <button onClick={() => setOpen((o) => !o)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-accent">
                {open ? 'Show less' : 'Show more'} <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

export function Chips({ hit }: { hit: Hit }) {
  return (
    <>
      {hit.dense && <Badge tone="info" className="font-mono">semantic {hit.dense.score.toFixed(2)} · #{hit.dense.rank}</Badge>}
      {hit.bm25 && <Badge tone="accent" className="font-mono">keyword #{hit.bm25.rank} · {hit.bm25.score.toFixed(1)}</Badge>}
      <Badge>{Math.round(hit.coverage * 100)}% of your words</Badge>
    </>
  )
}

import { AlertCircle, ArrowUp, BookX, Eye, EyeOff, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../hooks/app'
import type { Turn } from '../hooks/useChat'
import { RenderAnswer } from '../lib/text'
import { Inspector } from './Inspector'
import { SourceCard } from './Sources'
import { Badge, cn } from './ui'

export function TurnView({ turn }: { turn: Turn }) {
  const { settings } = useSettings()
  const [inspect, setInspect] = useState(settings.showInspector)
  const [flash, setFlash] = useState<number | null>(null)
  const refs = useRef(new Map<number, HTMLDivElement>())

  const cite = (n: number) => {
    const el = refs.current.get(n)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    setFlash(null)
    requestAnimationFrame(() => setFlash(n))
  }

  const streaming = turn.status === 'answering' && turn.answer.length > 0
  const declined = turn.status !== 'searching' && turn.confident === false

  return (
    <div className="enter space-y-4" data-turn={turn.id}>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] font-medium text-accent-ink" data-testid="user-message">{turn.question}</div>
      </div>

      <div className="flex gap-3">
        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><span className="font-serif text-sm font-bold">P</span></div>
        <div className="min-w-0 flex-1 space-y-3">
          {turn.status === 'searching' && <p className="text-sm text-sub" role="status">Searching the handbook…</p>}

          {declined && (
            <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4" data-testid="declined">
              <BookX size={18} className="mt-0.5 shrink-0 text-sub" />
              <div className="text-[15px]">
                <p className="font-medium">That is not in the handbook.</p>
                <p className="mt-1 text-sm text-sub">{turn.answer || 'Try rephrasing, or ask HR directly at people@northwind.example.'}</p>
              </div>
            </div>
          )}

          {!declined && (turn.answer || turn.status === 'answering') && (
            <div className={cn('text-[15px] leading-relaxed', streaming && 'caret')} data-testid="answer">
              <RenderAnswer text={turn.answer} onCite={cite} sources={turn.passages.length} />
            </div>
          )}

          {turn.status === 'error' && (
            <div className="flex items-start gap-2.5 rounded-xl border border-bad/40 bg-bad/10 p-3.5 text-sm text-bad" role="alert">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <span>{turn.error}</span>
            </div>
          )}
          {turn.status === 'stopped' && <p className="text-sm text-sub">Stopped.</p>}

          {(turn.status === 'done' || turn.status === 'stopped' || turn.status === 'error') && turn.passages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-sub">
              <Badge tone={turn.answerer === 'claude' ? 'accent' : 'neutral'}>{turn.answerer === 'claude' ? 'Claude' : 'Extractive'}</Badge>
              <Badge>{turn.mode}</Badge>
              <span>{turn.totalMs !== undefined && `${(turn.totalMs / 1000).toFixed(1)} s`}</span>
              <button onClick={() => setInspect((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 font-medium text-accent" aria-expanded={inspect}>
                {inspect ? <EyeOff size={14} /> : <Eye size={14} />} {inspect ? 'Hide' : 'Show'} how this was found
              </button>
            </div>
          )}

          {inspect && turn.passages.length > 0 && <Inspector turn={turn} />}

          {turn.passages.length > 0 && !declined && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sub">Sources</p>
              <div className="space-y-2.5">
                {turn.passages.map((p) => (
                  <SourceCard key={p.n} passage={p} question={turn.question} flashing={flash === p.n} ref={(el) => { if (el) refs.current.set(p.n, el); else refs.current.delete(p.n) }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function Composer({ onSend, onStop, busy, disabled }: { onSend: (q: string) => void; onStop: () => void; busy: boolean; disabled?: boolean }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const send = () => {
    if (!value.trim() || busy || disabled) return
    onSend(value)
    setValue('')
  }
  return (
    <div className="border-t border-line bg-bg/90 px-4 pb-4 pt-3 backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-lg focus-within:border-accent">
          <textarea
            ref={ref}
            value={value}
            rows={1}
            maxLength={600}
            aria-label="Ask a question"
            placeholder="Ask about leave, pay, benefits, expenses, security…"
            className="max-h-40 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] placeholder:text-muted focus:outline-none"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          {busy ? (
            <button onClick={onStop} aria-label="Stop" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink hover:bg-line"><Square size={15} fill="currentColor" /></button>
          ) : (
            <button onClick={send} disabled={!value.trim() || disabled} aria-label="Send" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink transition-opacity disabled:opacity-40"><ArrowUp size={18} strokeWidth={2.5} /></button>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted">Enter to send · Shift+Enter for a new line · Answers cite the handbook</p>
      </div>
    </div>
  )
}

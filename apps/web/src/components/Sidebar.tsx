import { BarChart3, FilePlus2, FileText, MessageSquare, Moon, Settings2, Sun, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { useEngine, useEngineStatus } from '../hooks/app'
import { Badge, cn } from './ui'

export type Page = 'chat' | 'eval'

export function Sidebar({ page, onPage, onAdd, onSettings, theme, onTheme }: { page: Page; onPage: (p: Page) => void; onAdd: () => void; onSettings: () => void; theme: 'dark' | 'light'; onTheme: () => void }) {
  const engine = useEngine()
  const { documents } = useEngineStatus()
  const [error, setError] = useState('')
  const chunks = documents.reduce((a, d) => a + d.chunks, 0)

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink"><span className="font-serif text-base font-bold leading-none">P</span></span>
        <div>
          <p className="text-[15px] font-semibold leading-none tracking-tight">PolicyPilot</p>
          <p className="mt-1 text-[11px] text-sub">Ask the handbook</p>
        </div>
      </div>

      <nav className="space-y-0.5 px-3" aria-label="Main">
        {([['chat', 'Ask', MessageSquare], ['eval', 'Evaluation', BarChart3]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => onPage(id)} aria-current={page === id ? 'page' : undefined} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', page === id ? 'bg-accent-soft text-accent' : 'text-sub hover:bg-surface-2 hover:text-ink')}>
            <Icon size={17} /> {label}
          </button>
        ))}
      </nav>

      <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
        <div className="mb-2 flex items-center justify-between px-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-sub">Knowledge base</p>
          <span className="text-xs text-muted">{documents.length} docs · {chunks} chunks</span>
        </div>
        <ul className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1" aria-label="Documents">
          {documents.map((d) => (
            <li key={d.id} className="group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] text-sub hover:bg-surface-2">
              {d.source === 'upload' ? <Upload size={14} className="shrink-0 text-accent" /> : <FileText size={14} className="shrink-0" />}
              <span className="min-w-0 flex-1 truncate" title={d.title}>{d.title}</span>
              {d.source === 'upload' ? (
                <button aria-label={`Remove ${d.title}`} onClick={() => engine.removeDocument(d.id).catch((e) => setError(e.message))} className="opacity-0 transition-opacity hover:text-bad focus:opacity-100 group-hover:opacity-100"><Trash2 size={14} /></button>
              ) : (
                <span className="text-[11px] text-muted">{d.chunks}</span>
              )}
            </li>
          ))}
        </ul>
        {error && <p className="px-3 py-1 text-xs text-bad" role="alert">{error}</p>}
        <button onClick={onAdd} className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-[13px] font-medium text-sub transition-colors hover:border-accent hover:text-accent">
          <FilePlus2 size={15} /> Add a document
        </button>
        <p className="mt-2 px-1 text-[11px] leading-snug text-muted">Markdown, text or PDF. {engine.kind === 'local' ? 'Stays in this browser tab.' : 'Stored on the server until it restarts.'}</p>
      </div>

      <div className="mt-3 flex items-center gap-1 border-t border-line p-3">
        <button onClick={onSettings} className="flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-sub hover:bg-surface-2 hover:text-ink"><Settings2 size={16} /> Settings</button>
        <button onClick={onTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="rounded-lg p-2 text-sub hover:bg-surface-2 hover:text-ink">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      </div>
    </div>
  )
}

export function ModelBadge() {
  const { neural, answerer, offline } = useEngineStatus()
  const engine = useEngine()
  if (offline) return <Badge tone="bad">Server offline</Badge>
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {neural.state === 'loading' && (
        <Badge tone="accent" className="gap-2" data-testid="model-status">
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-accent/25"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(neural.progress * 100)}%` }} /></span>
          Loading search model {Math.round(neural.progress * 100)}%
        </Badge>
      )}
      {neural.state === 'ready' && <Badge tone="good" ><span className="h-1.5 w-1.5 rounded-full bg-current" />Neural search ready</Badge>}
      {neural.state === 'off' && <Badge>Lightweight search</Badge>}
      {neural.state === 'error' && <Badge tone="bad" >Keyword search only</Badge>}
      <Badge tone={answerer === 'claude' ? 'accent' : 'neutral'}>{answerer === 'claude' ? 'Answers: Claude' : 'Answers: extractive'}</Badge>
      <span className="sr-only">{engine.kind}</span>
    </div>
  )
}

import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Composer, TurnView } from './components/Chat'
import { EmptyState } from './components/Empty'
import { AddDocModal, SettingsModal } from './components/Modals'
import { ModelBadge, Sidebar, type Page } from './components/Sidebar'
import { Segmented } from './components/ui'
import { useSettings } from './hooks/app'
import { useChat } from './hooks/useChat'
import { useTheme } from './lib/theme'
import { EvalPage } from './pages/Eval'

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [page, setPage] = useState<Page>('chat')
  const [add, setAdd] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const { settings, update } = useSettings()
  const { turns, ask, stop, busy, clear } = useChat()
  const scroller = useRef<HTMLDivElement>(null)

  // a new question scrolls so that it sits at the top of the view, with its answer filling in below it
  const count = turns.length
  useEffect(() => {
    if (count === 0) return
    const el = scroller.current
    const last = el?.querySelector<HTMLElement>('[data-turn]:last-of-type')
    if (el && last) el.scrollTo({ top: Math.max(0, last.offsetTop - 24) })
  }, [count])

  const sidebar = (
    <Sidebar page={page} onPage={(p) => { setPage(p); setMenu(false) }} onAdd={() => setAdd(true)} onSettings={() => setSettingsOpen(true)} theme={theme} onTheme={toggleTheme} />
  )

  return (
    <div className="flex h-full" style={{ backgroundImage: 'radial-gradient(900px 380px at 60% -120px, var(--glow), transparent 70%)', backgroundRepeat: 'no-repeat' }}>
      <aside className="hidden w-72 shrink-0 border-r border-line lg:block">{sidebar}</aside>
      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenu(false)} />
          <aside className="enter absolute inset-y-0 left-0 w-80 max-w-[88vw] border-r border-line">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur">
          <button onClick={() => setMenu((m) => !m)} aria-label="Menu" className="rounded-lg p-1.5 text-sub hover:bg-surface-2 lg:hidden">{menu ? <X size={20} /> : <Menu size={20} />}</button>
          <ModelBadge />
          <div className="ml-auto hidden items-center gap-3 sm:flex">
            {page === 'chat' && (
              <>
                <Segmented label="Retrieval mode" value={settings.mode} onChange={(mode) => update({ mode })} items={[{ id: 'semantic', label: 'Semantic', hint: 'Embeddings only' }, { id: 'hybrid', label: 'Hybrid', hint: 'BM25 + embeddings, fused' }, { id: 'keyword', label: 'Keyword', hint: 'BM25 only' }]} />
                {turns.length > 0 && <button onClick={clear} className="text-[13px] text-sub hover:text-ink">New chat</button>}
              </>
            )}
          </div>
        </header>

        {page === 'eval' ? (
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin"><EvalPage /></div>
        ) : (
          <>
            <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4">
              {turns.length === 0 ? (
                <EmptyState onPick={(q) => void ask(q)} />
              ) : (
                <div className="mx-auto max-w-3xl space-y-9 py-8">
                  {turns.map((t) => <TurnView key={t.id} turn={t} />)}
                </div>
              )}
            </div>
            <Composer onSend={(q) => void ask(q)} onStop={stop} busy={busy} />
          </>
        )}
      </div>

      <AddDocModal open={add} onClose={() => setAdd(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

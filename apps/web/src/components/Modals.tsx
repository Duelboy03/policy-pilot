import { FileUp, KeyRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IS_SERVER, useEngine, useEngineStatus, useSettings } from '../hooks/app'
import { Badge, Button, Field, inputCls, Modal, Segmented } from './ui'

export function AddDocModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engine = useEngine()
  const [tab, setTab] = useState<'file' | 'paste'>('file')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTab('file')
      setTitle('')
      setText('')
      setError('')
      setBusy(false)
    }
  }, [open])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a document" footer={tab === 'paste' ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || text.trim().length < 20} onClick={() => run(() => engine.addText(title, text))}>{busy ? 'Indexing…' : 'Add'}</Button></> : <Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        <Segmented label="How to add" value={tab} onChange={setTab} items={[{ id: 'file', label: 'Upload a file' }, { id: 'paste', label: 'Paste text' }]} />
        {tab === 'file' ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void run(() => engine.addFile(f)) }}
            className={`grid place-items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${drag ? 'border-accent bg-accent-soft' : 'border-line'}`}
          >
            <FileUp size={26} className="text-accent" />
            <p className="mt-3 text-sm font-medium">{busy ? 'Reading and indexing…' : 'Drop a file here'}</p>
            <p className="mt-1 text-xs text-sub">.md, .txt or .pdf, up to 2 MB. PDFs need selectable text.</p>
            <Button className="mt-4" onClick={() => input.current?.click()} disabled={busy}>Choose a file</Button>
            <input ref={input} type="file" accept=".md,.markdown,.txt,.pdf" hidden data-testid="file-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(() => engine.addFile(f)) }} />
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Parking policy" /></Field>
            <Field label="Text" hint="Markdown headings (## Section) become the sections that answers cite."><textarea className={`${inputCls} min-h-44`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a policy here…" /></Field>
          </div>
        )}
        {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update } = useSettings()
  const engine = useEngine()
  const status = useEngineStatus()
  const [key, setKey] = useState(settings.claudeKey)
  useEffect(() => { if (open) setKey(settings.claudeKey) }, [open, settings.claudeKey])

  return (
    <Modal open={open} onClose={onClose} title="Settings" footer={<Button variant="primary" onClick={() => { update({ claudeKey: key.trim() }); onClose() }}>Done</Button>}>
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Retrieval</h3>
          <Segmented label="Retrieval mode" value={settings.mode} onChange={(mode) => update({ mode })} items={[{ id: 'semantic', label: 'Semantic', hint: 'Embeddings only' }, { id: 'hybrid', label: 'Hybrid', hint: 'BM25 + embeddings, fused' }, { id: 'keyword', label: 'Keyword', hint: 'BM25 only' }]} />
          <p className="mt-2 text-xs leading-relaxed text-sub">On the bundled evaluation set, semantic search ranks the right passage in the top 3 for 98% of questions, hybrid for 86% and keyword for 60%. Hybrid helps when questions contain exact identifiers; this handbook has few.</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[13px] font-medium">Passages to show</span>
            <Segmented label="Number of passages" value={String(settings.k)} onChange={(k) => update({ k: Number(k) })} items={['3', '4', '5', '6'].map((n) => ({ id: n, label: n }))} />
          </div>
        </section>

        {!IS_SERVER && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">Search model {status.neural.state === 'ready' && <Badge tone="good">MiniLM ready</Badge>}</h3>
            <Segmented label="Embedding model" value={status.neural.state === 'off' ? 'hash' : 'neural'} onChange={(v) => void engine.useNeural?.(v === 'neural')} items={[{ id: 'neural', label: 'Neural (MiniLM, 23 MB)' }, { id: 'hash', label: 'Lightweight (hashing)' }]} />
            <p className="mt-2 text-xs leading-relaxed text-sub">The neural model understands meaning ("day off for Diwali" finds the floating holiday). It downloads once and runs in your browser. The lightweight option only matches shared words and is much weaker.</p>
          </section>
        )}

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} className="text-accent" /> Answer engine</h3>
          {IS_SERVER ? (
            <p className="text-xs leading-relaxed text-sub">The server decides: it uses Claude when it was started with <code className="rounded bg-surface-2 px-1">ANTHROPIC_API_KEY</code>, otherwise the extractive engine. Currently <b className="text-ink">{status.answerer}</b>.</p>
          ) : (
            <>
              <p className="mb-3 text-xs leading-relaxed text-sub">By default answers are quoted straight from the handbook, with no AI model involved. Paste an Anthropic API key to have Claude write the answers instead, grounded in the same passages.</p>
              <div className="space-y-3">
                <Field label="Anthropic API key" hint="Kept in memory for this tab only. It is sent directly from your browser to api.anthropic.com, never stored and never sent anywhere else.">
                  <input type="password" autoComplete="off" spellCheck={false} className={inputCls} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" />
                </Field>
                <Field label="Model"><input className={inputCls} value={settings.claudeModel} onChange={(e) => update({ claudeModel: e.target.value })} /></Field>
              </div>
            </>
          )}
        </section>

        <section>
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={settings.showInspector} onChange={(e) => update({ showInspector: e.target.checked })} />
            Open “how this was found” by default
          </label>
        </section>
      </div>
    </Modal>
  )
}

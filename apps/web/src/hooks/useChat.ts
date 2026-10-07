import type { Passage, RetrievalMode } from '@policypilot/core'
import { useCallback, useRef, useState } from 'react'
import { useEngine, useEngineStatus, useSettings } from './app'

export interface Turn {
  id: string
  question: string
  status: 'searching' | 'answering' | 'done' | 'error' | 'stopped'
  mode?: RetrievalMode
  requestedMode: RetrievalMode
  confident?: boolean
  passages: Passage[]
  answer: string
  error?: string
  answerer: 'extractive' | 'claude'
  retrievalMs?: number
  firstTokenMs?: number
  totalMs?: number
}

let counter = 0

export function useChat() {
  const engine = useEngine()
  const status = useEngineStatus()
  const { settings } = useSettings()
  const [turns, setTurns] = useState<Turn[]>([])
  const abort = useRef<AbortController | null>(null)
  const busy = turns.at(-1)?.status === 'searching' || turns.at(-1)?.status === 'answering'

  const patch = (id: string, p: Partial<Turn>) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)))

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || busy) return
      const id = `t${++counter}`
      const started = performance.now()
      const controller = new AbortController()
      abort.current = controller
      setTurns((ts) => [...ts, { id, question: q, status: 'searching', requestedMode: settings.mode, passages: [], answer: '', answerer: status.answerer }])
      let answer = ''
      let first: number | undefined
      try {
        for await (const ev of engine.ask(q, { mode: settings.mode, k: settings.k, signal: controller.signal })) {
          if (ev.type === 'sources') patch(id, { status: 'answering', mode: ev.mode, confident: ev.confident, passages: ev.passages, retrievalMs: performance.now() - started })
          else if (ev.type === 'token') {
            first ??= performance.now() - started
            answer += ev.text
            patch(id, { answer, firstTokenMs: first })
          } else patch(id, { status: 'done', totalMs: performance.now() - started })
        }
      } catch (e) {
        if (controller.signal.aborted) patch(id, { status: 'stopped', totalMs: performance.now() - started })
        else patch(id, { status: 'error', error: e instanceof Error ? e.message : 'Something went wrong.', totalMs: performance.now() - started })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, busy, settings.mode, settings.k, status.answerer],
  )

  const stop = useCallback(() => abort.current?.abort(), [])
  const clear = useCallback(() => setTurns([]), [])
  return { turns, ask, stop, clear, busy }
}

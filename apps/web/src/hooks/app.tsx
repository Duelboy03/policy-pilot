import type { RetrievalMode } from '@policypilot/core'
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createEngine, ENGINE_KIND, type Engine, type EngineStatus } from '../engine'

/* ---------- engine ---------- */
const EngineCtx = createContext<Engine | null>(null)

export function EngineProvider({ children }: { children: ReactNode }) {
  const engine = useMemo(createEngine, [])
  useEffect(() => {
    void engine.init()
  }, [engine])
  return <EngineCtx.Provider value={engine}>{children}</EngineCtx.Provider>
}

export function useEngine(): Engine {
  const e = useContext(EngineCtx)
  if (!e) throw new Error('useEngine must be used inside <EngineProvider>')
  return e
}

export function useEngineStatus(): EngineStatus {
  const e = useEngine()
  return useSyncExternalStore(e.subscribe, e.getStatus)
}

/* ---------- settings ---------- */
export interface Settings {
  mode: RetrievalMode
  k: number
  claudeKey: string
  claudeModel: string
  showInspector: boolean
}

const DEFAULTS: Settings = { mode: 'semantic', k: 4, claudeKey: '', claudeModel: 'claude-sonnet-5-5', showInspector: false }
const KEY = 'policypilot:settings'

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    // the API key is deliberately never persisted: it lives in memory for the life of the tab
    return { ...DEFAULTS, ...saved, claudeKey: '' }
  } catch {
    return DEFAULTS
  }
}

const SettingsCtx = createContext<{ settings: Settings; update: (p: Partial<Settings>) => void } | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const engine = useEngine()
  const [settings, setSettings] = useState<Settings>(load)
  const update = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p }))

  useEffect(() => {
    try {
      const { claudeKey: _omit, ...persist } = settings
      localStorage.setItem(KEY, JSON.stringify(persist))
    } catch {
      /* storage blocked */
    }
  }, [settings])

  useEffect(() => {
    engine.configureClaude?.(settings.claudeKey ? { apiKey: settings.claudeKey, model: settings.claudeModel } : null)
  }, [engine, settings.claudeKey, settings.claudeModel])

  return <SettingsCtx.Provider value={{ settings, update }}>{children}</SettingsCtx.Provider>
}

export function useSettings() {
  const c = useContext(SettingsCtx)
  if (!c) throw new Error('useSettings must be used inside <SettingsProvider>')
  return c
}

export const IS_SERVER = ENGINE_KIND === 'server'

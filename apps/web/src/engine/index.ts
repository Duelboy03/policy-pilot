import { LocalEngine } from './local'
import { ServerEngine } from './server'
import type { Engine } from './types'

export const ENGINE_KIND: 'local' | 'server' = import.meta.env.VITE_ENGINE === 'server' ? 'server' : 'local'
export const createEngine = (): Engine => (ENGINE_KIND === 'server' ? new ServerEngine() : new LocalEngine())
export type { AskOptions, ClaudeConfig, DocInfo, Engine, EngineStatus } from './types'

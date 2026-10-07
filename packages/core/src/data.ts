import type { EvalCase } from './eval'
import type { KbState } from './kb'
import handbook from './generated/handbook.json'
import evalCases from '../data/eval.json'

/** The bundled handbook, chunked and embedded ahead of time by `npm run build:index`. */
export const HANDBOOK = handbook as unknown as KbState & { hash: string }
export const EVAL_CASES = evalCases as EvalCase[]
export { default as EVAL_RESULTS } from '../eval/results.json'

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DocInput } from './types'

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

/** Reads the bundled handbook markdown files. The first `# ` heading is the document title. */
export function readHandbook(dir = join(DATA_DIR, 'handbook')): DocInput[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const text = readFileSync(join(dir, f), 'utf8')
      return { id: f.replace(/\.md$/, ''), title: /^#\s+(.+)$/m.exec(text)?.[1] ?? f, text, source: 'handbook' as const }
    })
}

export const hashDocs = (docs: DocInput[]) =>
  createHash('sha256').update(docs.map((d) => `${d.id}\n${d.text}`).join('\n---\n')).digest('hex').slice(0, 16)

import { contentWords, stem } from '@policypilot/core'
import type { ReactNode } from 'react'

/** wrap the words of `text` that share a stem with the question in <mark> */
export function highlight(text: string, question: string): ReactNode[] {
  const stems = new Set(contentWords(question).map(stem))
  if (stems.size === 0) return [text]
  return text.split(/([A-Za-z0-9]+)/).map((part, i) => (stems.has(stem(part.toLowerCase())) && /[A-Za-z0-9]/.test(part) ? <mark key={i} className="hl">{part}</mark> : part))
}

function inline(text: string, key: string, onCite: (n: number) => void, max: number): ReactNode[] {
  // **bold**, `code` and [n] citations
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[(\d{1,2})\])/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={`${key}-${i}`} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={`${key}-${i}`} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>)
    else {
      const n = Number(m[2])
      out.push(
        <button
          key={`${key}-${i}`}
          onClick={() => onCite(n)}
          disabled={n < 1 || n > max}
          aria-label={`Source ${n}`}
          className="mx-0.5 inline-flex h-[1.35em] min-w-[1.35em] -translate-y-px items-center justify-center rounded-md bg-accent-soft px-1 align-baseline text-[0.72em] font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-40"
        >
          {n}
        </button>,
      )
    }
    last = m.index + tok.length
    i++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** A small renderer for answers: paragraphs, bullet and numbered lists, bold, code and clickable citations. */
export function RenderAnswer({ text, onCite, sources }: { text: string; onCite: (n: number) => void; sources: number }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`l${blocks.length}`} className={`my-2 space-y-1.5 pl-5 ${list.ordered ? 'list-decimal' : 'list-disc'} marker:text-muted`}>
        {list.items.map((it, i) => <li key={i}>{inline(it, `li${blocks.length}-${i}`, onCite, sources)}</li>)}
      </Tag>,
    )
    list = null
  }
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || num) {
      const ordered = !!num
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push((bullet ?? num)![1])
    } else {
      flush()
      if (line.trim()) blocks.push(<p key={`p${idx}`} className="my-2 first:mt-0 last:mb-0">{inline(line, `p${idx}`, onCite, sources)}</p>)
    }
  })
  flush()
  return <>{blocks}</>
}

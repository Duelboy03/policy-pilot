import type { Chunk, DocInput } from './types'

export interface ChunkOptions {
  /** aim for chunks of about this many words */
  targetWords?: number
  /** never exceed this many words unless a single sentence is longer */
  maxWords?: number
  /** sentences repeated at the start of the next chunk of the same section */
  overlapSentences?: number
}

const countWords = (s: string) => (s.match(/\S+/g) ?? []).length

/** Split on sentence ends, keeping list items and decimals like "1.67" intact. */
export function sentences(text: string): string[] {
  const out: string[] = []
  for (const block of text.split(/\n+/)) {
    const line = block.trim()
    if (!line) continue
    if (/^([-*•]|\d+\.)\s/.test(line)) {
      out.push(line)
      continue
    }
    const parts = line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    // re-join pieces that were split after an abbreviation
    for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
      const prev = out[out.length - 1]
      if (prev && /\b(e\.g|i\.e|vs|approx|no|inc)\.$/i.test(prev)) out[out.length - 1] = `${prev} ${p}`
      else out.push(p)
    }
  }
  return out
}

interface Section {
  heading: string
  body: string
  page?: number
}

function sectionsOf(doc: DocInput): Section[] {
  const out: Section[] = []
  const pushText = (text: string, page?: number) => {
    const path: string[] = []
    let buf: string[] = []
    const flush = () => {
      const body = buf.join('\n').trim()
      if (body) out.push({ heading: path.join(' › '), body, page })
      buf = []
    }
    for (const line of text.split('\n')) {
      const m = /^(#{1,4})\s+(.*)$/.exec(line)
      if (m) {
        flush()
        const level = m[1].length
        // the single H1 is the document title, so headings start below it
        if (level === 1) continue
        path.length = level - 2
        path[level - 2] = m[2].trim()
      } else buf.push(line)
    }
    flush()
  }
  if (doc.pages?.length) doc.pages.forEach((p, i) => pushText(p, i + 1))
  else pushText(doc.text)
  return out
}

/**
 * Markdown-aware chunking. Each section becomes one or more chunks packed up to
 * `targetWords`, split on sentence boundaries, never across a heading, with a small overlap
 * so a fact at the boundary is present in both neighbours.
 */
export function chunkDocument(doc: DocInput, opts: ChunkOptions = {}): Chunk[] {
  const target = opts.targetWords ?? 130
  const max = opts.maxWords ?? 200
  const overlap = opts.overlapSentences ?? 1
  const chunks: Chunk[] = []

  const emit = (heading: string, text: string, page?: number) => {
    const index = chunks.length
    chunks.push({
      id: `${doc.id}#${index}`,
      docId: doc.id,
      docTitle: doc.title,
      heading,
      text,
      embedText: `${doc.title}${heading ? ` — ${heading}` : ''}\n${text}`,
      index,
      ...(page ? { page } : {}),
    })
  }

  for (const sec of sectionsOf(doc)) {
    if (countWords(sec.body) <= max) {
      emit(sec.heading, sec.body.replace(/\n{2,}/g, '\n'), sec.page)
      continue
    }
    const sents = sentences(sec.body)
    let cur: string[] = []
    let words = 0
    let fresh = 0 // sentences in `cur` that were not carried over as overlap
    const flush = () => {
      if (fresh > 0) emit(sec.heading, cur.join(' '), sec.page)
      const carry = overlap > 0 ? cur.slice(-overlap) : []
      cur = [...carry]
      words = countWords(cur.join(' '))
      fresh = 0
    }
    for (const s of sents) {
      const w = countWords(s)
      if (words + w > max && fresh > 0) flush()
      cur.push(s)
      words += w
      fresh++
      if (words >= target) flush()
    }
    if (fresh > 0) emit(sec.heading, cur.join(' '), sec.page)
  }
  return chunks
}

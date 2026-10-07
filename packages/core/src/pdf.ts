/** The part of pdf.js used here, so the caller can supply the browser or the Node build. */
export interface PdfJsLike {
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean }[] }> }>
    }>
  }
}

/** Extract the text of each page of a PDF, keeping line breaks so paragraphs survive chunking. */
export async function pdfToPages(pdfjs: PdfJsLike, data: Uint8Array): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    let text = ''
    for (const item of content.items) {
      if (typeof item.str !== 'string') continue
      text += item.str
      text += item.hasEOL ? '\n' : ' '
    }
    pages.push(text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim())
  }
  return pages.filter(Boolean)
}

/** A readable title from a file name: "leave-policy_v2.pdf" becomes "Leave policy v2". */
export function titleFromFilename(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim()
  return base ? base[0].toUpperCase() + base.slice(1) : 'Untitled document'
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'doc'

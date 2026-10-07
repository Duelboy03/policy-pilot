import { pdfToPages, type PdfJsLike } from '@policypilot/core'

/** pdf.js is large, so it is only loaded when someone uploads a PDF. */
export async function extractPdf(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const pages = await pdfToPages(pdfjs as unknown as PdfJsLike, new Uint8Array(await file.arrayBuffer()))
  if (pages.length === 0) throw new Error('No text found in that PDF. Scanned PDFs need OCR first.')
  return pages
}

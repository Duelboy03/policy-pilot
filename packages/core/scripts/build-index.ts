import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { KnowledgeBase } from '../src'
import { DATA_DIR, hashDocs, readHandbook } from '../src/node'
import { createTransformersEmbedder } from '../src/transformers'

/** Chunk and embed the handbook once, so the web app and server start with a ready index. */
const docs = readHandbook()
console.log(`Loading the embedding model (the first run downloads about 23 MB)...`)
let last = -1
const embedder = await createTransformersEmbedder({
  onProgress: (f) => {
    const pct = Math.round(f * 100)
    if (pct !== last && pct % 10 === 0) console.log(`  model download ${pct}%`)
    last = pct
  },
})
const kb = new KnowledgeBase(embedder)
for (const d of docs) await kb.addDocument(d)
const state = { ...kb.exportState(), hash: hashDocs(docs) }
writeFileSync(join(DATA_DIR, '..', 'src', 'generated', 'handbook.json'), JSON.stringify(state))
console.log(`Indexed ${docs.length} documents into ${state.chunks.length} chunks (${embedder.name}, ${embedder.dim} dims).`)

// Copies the free OCR engine (tesseract.js) + English data into public/ocr so the app
// can read scanned newspaper PDFs without any external service. Runs after npm install.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const out = join(process.cwd(), 'public', 'ocr')
mkdirSync(out, { recursive: true })
const tjs = dirname(require.resolve('tesseract.js/package.json'))
const core = dirname(require.resolve('tesseract.js-core/package.json'))
const eng = dirname(require.resolve('@tesseract.js-data/eng/package.json'))
const files = [
  [join(tjs, 'dist', 'worker.min.js'), 'worker.min.js'],
  [join(core, 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [join(core, 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [join(eng, '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
]
for (const [src, name] of files) {
  if (!existsSync(src)) { console.warn(`[ocr] missing ${src}`); continue }
  cpSync(src, join(out, name))
}
console.log('[ocr] assets copied to public/ocr')

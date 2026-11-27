export type AdType = 'tolet' | 'sale' | 'wanted' | 'commercial' | 'other'
export type ExtractOpt = 'tolet' | 'sale' | 'wanted' | 'commercial' | 'furnished' | 'all'

export interface ParsedAd {
  ad_type: AdType
  configuration: string
  location_text: string
  phones: string[]
  rent_text: string | null
  raw_text: string
  is_commercial: boolean
  is_furnished: boolean
  page_number: number | null
}

const phoneRe = /(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/g
const digitsOnly = (p: string) => p.replace(/\D/g, '')
const adStartRe = /^(to\s*-?\s*let|for\s+(sale|rent)|wanted|required|available)\b/i
const rentRe = /(?:Rs\.?|₹|INR)\s*[\d,]+(?:\s*\/\s*-?)?(?:\s*\/?\s*(?:month|mo|pm|p\.m\.))?/gi
const bhkRe = /(\d)\s*\+?\s*BHK/i
const singleRe = /single\s*(bed|room|bedroom)/i
const commRe = /(?<!post\s)\boffice\b|godown|\bshops?\b|commercial|showroom|warehouse/i
const residentialRe = /\bbhk\b|\bflat\b|\bhouse\b|\broom\b|apartment|\bquarters?\b/i
const bareRentRe = /\brent\s*[:.-]?\s*([\d]{1,3}(?:,\d{3})+|\d{4,6})\b/i
const toletRe = /to\s*-?\s*let|for\s+rent|rent(?:ed)?\b|available\s+for|flat\s+for|house\s+for/i
const saleRe = /for\s+sale|\bsale\b/i
const wantRe = /\bwant(?:ed)?\b|\bneed(?:ed)?\b|\brequire[sd]?\b/i
const furnRe = /furnish/i

/** Split extracted newspaper text into classified blocks and pull out listings. */
export function parseClassifieds(text: string, opts: ExtractOpt[], pageMarker = /^\[\[page (\d+)\]\]$/): ParsedAd[] {
  const blocks: { text: string; page: number | null }[] = []
  let cur: string[] = []
  let page: number | null = null
  const flush = () => { if (cur.length) { blocks.push({ text: cur.join(' '), page }); cur = [] } }
  for (const rawLine of text.split('\n')) {
    const l = rawLine.trim()
    const pm = l.match(pageMarker)
    if (pm) { flush(); page = Number(pm[1]); continue }
    if (!l) { flush(); continue }
    if (adStartRe.test(l) && cur.length) flush()
    cur.push(l)
    // Phone numbers usually end an advert: close the block after a line containing one
    if (phoneRe.test(l) && /\d{5}\s*[.)]?\s*$/.test(l)) flush()
    phoneRe.lastIndex = 0
  }
  flush()

  const out: ParsedAd[] = []
  const seen = new Set<string>()
  for (const { text: blk, page: pg } of blocks) {
    const isToLet = toletRe.test(blk) || /bhk|flat|room|house|apartment/i.test(blk)
    const isSale = saleRe.test(blk)
    const isWant = wantRe.test(blk)
    const isComm = commRe.test(blk) && !(residentialRe.test(blk) && !/\b(shop|godown|showroom|warehouse)\b/i.test(blk))
    const isFurn = furnRe.test(blk)
    if (!opts.includes('all')) {
      let m = false
      if (opts.includes('tolet') && isToLet) m = true
      if (opts.includes('sale') && isSale) m = true
      if (opts.includes('wanted') && isWant) m = true
      if (opts.includes('commercial') && isComm) m = true
      if (opts.includes('furnished') && isFurn) m = true
      if (!m) continue
    }
    const phones = [...new Set([...blk.matchAll(phoneRe)].map((x) => '+91' + digitsOnly(x[0])))]
    if (!phones.length) continue
    let cfg = 'Other'
    const bm = blk.match(bhkRe)
    if (bm) cfg = Number(bm[1]) >= 5 ? '5+ BHK' : `${bm[1]} BHK`
    else if (singleRe.test(blk)) cfg = 'Single Room'
    else if (isComm) cfg = 'Commercial'
    const rentM = blk.match(rentRe)
    const bareM = rentM ? null : blk.match(bareRentRe)
    const rent = rentM ? rentM[0].replace(/\s+/g, '').replace(/^(Rs\.?|INR)/i, '₹').slice(0, 60) : bareM ? `₹${bareM[1]}` : null
    const loc = blk
      .replace(phoneRe, '').replace(rentRe, '')
      .replace(bareRentRe, '').replace(/to\s*-?\s*let[\s:.-]*/gi, '')
      .replace(/\b(contact|call|ph(one)?|mob(ile)?|cell)\b\.?\s*(no\.?)?\s*[:.-]?\s*/gi, '').replace(/\b(rent|rs)\.?\s*(?=[.,;]|$)/gi, '').replace(/\s+([.,;])/g, '$1').replace(/([.,;])\1+/g, '$1')
      .replace(/[\s,/;-]+$/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, 300)
    const key = phones.slice().sort().join('|') + '#' + cfg
    if (seen.has(key)) continue
    seen.add(key)
    const ad_type: AdType = isWant && !isToLet ? 'wanted' : isSale && !toletRe.test(blk) ? 'sale' : isComm ? 'commercial' : isToLet ? 'tolet' : 'other'
    out.push({ ad_type, configuration: cfg, location_text: loc, phones, rent_text: rent, raw_text: blk.slice(0, 3000), is_commercial: isComm, is_furnished: isFurn, page_number: pg })
  }
  return out
}

type TextItem = { str: string; x: number; y: number; w: number; h: number }

/**
 * Newspaper pages have many columns. Reading pdf.js items top-to-bottom would mix
 * neighbouring columns, so first find the vertical gutters, then read each column.
 */
function pageItemsToText(items: TextItem[], pageWidth: number): string {
  if (!items.length) return ''
  const W = Math.max(1, Math.ceil(pageWidth))
  const cover = new Uint16Array(W + 1)
  for (const it of items) {
    const a = Math.max(0, Math.floor(it.x)), b = Math.min(W, Math.ceil(it.x + Math.max(it.w, 1)))
    for (let i = a; i < b; i++) cover[i]++
  }
  let max = 0
  for (let i = 0; i < W; i++) if (cover[i] > max) max = cover[i]
  // full-width headlines cross the gutters, so allow a little coverage there
  const thresh = Math.max(1, Math.floor(max * 0.2))
  const seps: number[] = []
  let runStart = -1
  for (let i = 0; i <= W; i++) {
    const empty = i < W && cover[i] <= thresh
    if (empty && runStart < 0) runStart = i
    if (!empty && runStart >= 0) {
      const len = i - runStart
      const mid = runStart + len / 2
      if (len >= 5 && mid > W * 0.04 && mid < W * 0.96) seps.push(mid)
      runStart = -1
    }
  }
  const bounds = [0, ...seps, W + 1]
  const cols: TextItem[][] = bounds.slice(1).map(() => [])
  for (const it of items) {
    const cx = it.x + it.w / 2
    let c = 0
    while (c < cols.length - 1 && cx > bounds[c + 1]) c++
    cols[c].push(it)
  }
  const out: string[] = []
  for (const col of cols) {
    if (!col.length) continue
    col.sort((a, b) => (Math.abs(b.y - a.y) > Math.min(a.h, b.h) * 0.5 ? b.y - a.y : a.x - b.x))
    // 1) group items into lines
    const rows: { y: number; h: number; text: string }[] = []
    for (const it of col) {
      const last = rows[rows.length - 1]
      if (last && Math.abs(it.y - last.y) <= Math.max(2, Math.max(last.h, it.h) * 0.5)) {
        last.text += (last.text.endsWith(' ') || it.str.startsWith(' ') ? '' : ' ') + it.str
        last.h = Math.max(last.h, it.h)
      } else {
        rows.push({ y: it.y, h: it.h || 10, text: it.str })
      }
    }
    // 2) a paragraph break is a gap clearly larger than this column's normal line spacing
    const gaps = rows.slice(1).map((r, i) => rows[i].y - r.y).filter((g) => g > 0).sort((x, y) => x - y)
    const normal = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 12
    const lines: string[] = []
    rows.forEach((r, i) => {
      if (i > 0 && rows[i - 1].y - r.y > normal * 1.45) lines.push('')
      lines.push(r.text.trim())
    })
    out.push(lines.join('\n'))
  }
  return out.join('\n\n')
}

export interface PdfTextResult { text: string; pages: number; textPages: number; imagePages: number[] }

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      return pdfjs
    })
  }
  return pdfjsPromise
}

/** Extract the text layer of a PDF in the browser (column-aware), inserting [[page N]] markers. */
export async function extractPdfText(file: File, onProgress?: (page: number, total: number) => void): Promise<PdfTextResult> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const parts: string[] = []
  const imagePages: number[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress?.(p, doc.numPages)
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: TextItem[] = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const t = item.transform as number[]
      items.push({ str: item.str, x: t[4], y: t[5], w: item.width, h: item.height || Math.abs(t[3]) || 10 })
    }
    const text = pageItemsToText(items, vp.width)
    if (text.replace(/\s/g, '').length < 80) imagePages.push(p)
    parts.push(`[[page ${p}]]\n${text}`)
    page.cleanup()
  }
  const pages = doc.numPages
  await doc.destroy()
  return { text: parts.join('\n\n'), pages, textPages: pages - imagePages.length, imagePages }
}

/** Parse "5-7, 9" into page numbers (1-based, clamped). Empty → all pages. */
export function parsePageRange(input: string, total: number): number[] {
  const s = input.trim()
  if (!s) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set<number>()
  for (const part of s.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!m) continue
    const a = +m[1], b = m[2] ? +m[2] : a
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= total) set.add(i)
  }
  return [...set].sort((x, y) => x - y)
}

/**
 * Read scanned (image-only) pages with free in-browser OCR (tesseract.js, self-hosted in /ocr).
 * Tesseract separates paragraphs with blank lines, which maps well onto classified adverts.
 */
export async function ocrPdfPages(
  file: File, pages: number[],
  onProgress?: (info: { page: number; index: number; total: number; pct: number }) => void,
): Promise<string> {
  const pdfjs = await loadPdfjs()
  const { createWorker } = await import('tesseract.js')
  const base = `${window.location.origin}${import.meta.env.BASE_URL}ocr`
  let current = { page: 0, index: 0 }
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: base,
    langPath: base,
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.({ ...current, total: pages.length, pct: Math.round(m.progress * 100) })
    },
  })
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out: string[] = []
  try {
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]
      current = { page: p, index: i + 1 }
      onProgress?.({ ...current, total: pages.length, pct: 0 })
      const page = await doc.getPage(p)
      const base1 = page.getViewport({ scale: 1 })
      const scale = Math.min(3, 2600 / base1.width) // ~2600px wide: readable small classified print
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(vp.width)
      canvas.height = Math.ceil(vp.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })
      const items: TextItem[] = []
      type Word = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
      type Block = { paragraphs: { lines: { words: Word[] }[] }[] }
      for (const blk of ((data as unknown as { blocks?: Block[] }).blocks ?? [])) {
        for (const para of blk.paragraphs) for (const ln of para.lines) for (const w of ln.words) {
          if (!w.text.trim() || w.confidence < 20) continue
          const { x0, y0, x1, y1 } = w.bbox
          // flip y so that "higher on the page" = larger y, like PDF coordinates
          items.push({ str: w.text, x: x0, y: canvas.height - y1, w: x1 - x0, h: y1 - y0 })
        }
      }
      const pageText = items.length ? pageItemsToText(items, canvas.width) : data.text
      out.push(`[[page ${p}]]\n${pageText}`)
      page.cleanup()
      canvas.width = canvas.height = 0
    }
  } finally {
    await worker.terminate()
    await doc.destroy()
  }
  return out.join('\n\n')
}

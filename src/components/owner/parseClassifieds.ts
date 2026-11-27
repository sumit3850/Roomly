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

const phoneRe = /(?<!\d)[6-9]\d{9}(?!\d)/g
const rentRe = /(?:Rs\.?|₹|INR)\s*[\d,]+(?:\s*\/\s*-?)?(?:\s*\/?\s*(?:month|mo|pm|p\.m\.))?/gi
const bhkRe = /(\d)\s*\+?\s*BHK/i
const singleRe = /single\s*(bed|room|bedroom)/i
const commRe = /office|godown|shop|commercial|showroom|warehouse|sq\.?\s*(ft|mtr|m)\b/i
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
    cur.push(l)
    // Phone numbers usually end an advert: close the block after a line containing one
    if (phoneRe.test(l) && /\d{10}\s*[.)]?\s*$/.test(l)) flush()
    phoneRe.lastIndex = 0
  }
  flush()

  const out: ParsedAd[] = []
  const seen = new Set<string>()
  for (const { text: blk, page: pg } of blocks) {
    const isToLet = toletRe.test(blk) || /bhk|flat|room|house|apartment/i.test(blk)
    const isSale = saleRe.test(blk)
    const isWant = wantRe.test(blk)
    const isComm = commRe.test(blk)
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
    const phones = [...new Set([...blk.matchAll(phoneRe)].map((x) => '+91' + x[0]))]
    if (!phones.length) continue
    let cfg = 'Other'
    const bm = blk.match(bhkRe)
    if (bm) cfg = Number(bm[1]) >= 5 ? '5+ BHK' : `${bm[1]} BHK`
    else if (singleRe.test(blk)) cfg = 'Single Room'
    else if (isComm) cfg = 'Commercial'
    const rentM = blk.match(rentRe)
    const rent = rentM ? rentM[0].replace(/\s+/g, '').replace(/^(Rs\.?|INR)/i, '₹').slice(0, 60) : null
    const loc = blk
      .replace(phoneRe, '').replace(rentRe, '')
      .replace(/to\s*-?\s*let[\s:.-]*/gi, '').replace(/contact[\s:.-]*/gi, '').replace(/ph(one)?\s*(no)?[\s:.-]*/gi, '')
      .replace(/[\s,/;-]+$/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, 300)
    const key = phones.slice().sort().join('|') + '#' + cfg
    if (seen.has(key)) continue
    seen.add(key)
    const ad_type: AdType = isWant && !isToLet ? 'wanted' : isSale && !toletRe.test(blk) ? 'sale' : isComm ? 'commercial' : isToLet ? 'tolet' : 'other'
    out.push({ ad_type, configuration: cfg, location_text: loc, phones, rent_text: rent, raw_text: blk.slice(0, 3000), is_commercial: isComm, is_furnished: isFurn, page_number: pg })
  }
  return out
}

/** Extract text from a PDF in the browser with pdf.js, inserting [[page N]] markers. */
export async function extractPdfText(file: File, onProgress?: (page: number, total: number) => void): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const parts: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress?.(p, doc.numPages)
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    let lastY: number | null = null
    let line = ''
    const lines: string[] = [`[[page ${p}]]`]
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = item.transform[5] as number
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim())
        // a large vertical gap means a new advert
        if (Math.abs(y - lastY) > (item.height || 10) * 1.8) lines.push('')
        line = ''
      }
      line += item.str + (item.hasEOL ? '' : ' ')
      lastY = y
      if (item.hasEOL) { lines.push(line.trim()); line = ''; lastY = null }
    }
    if (line.trim()) lines.push(line.trim())
    parts.push(lines.join('\n'))
    page.cleanup()
  }
  const pages = doc.numPages
  await doc.destroy()
  return { text: parts.join('\n\n'), pages }
}

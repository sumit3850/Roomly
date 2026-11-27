/**
 * Daily newspaper downloader.
 *
 * Finds the latest Daily Telegrams e-paper PDFs published at dt.andamannicobar.gov.in,
 * downloads any edition from the last N days that isn't in the database yet, stores the
 * PDF in the `newspaper-pdfs` bucket, extracts the TO LET / classified adverts and saves
 * them to `newspaper_publications` + `newspaper_advertisements`.
 *
 * Runs server-side only (GitHub Actions, see .github/workflows/daily-papers.yml).
 *
 * Env:
 *   SUPABASE_URL                (required)
 *   SUPABASE_SERVICE_ROLE_KEY   (required, keep secret — never expose to the frontend)
 *   DT_SOURCE_URLS              comma-separated pages to scan for PDF links
 *                               (default: https://dt.andamannicobar.gov.in/)
 *   DAYS                        how many latest editions to keep fetched (default 5)
 *   DRY_RUN=1                   discover + parse but don't write anything
 */
import { createClient } from '@supabase/supabase-js'
import { parseClassifieds, type ExtractOpt } from '../src/components/owner/parseClassifieds'

const NEWSPAPER = 'Daily Telegrams'
const BUCKET = 'newspaper-pdfs'
const DAYS = Math.max(1, Number(process.env.DAYS ?? 5))
const DRY_RUN = process.env.DRY_RUN === '1'
const SOURCES = (process.env.DT_SOURCE_URLS || 'https://dt.andamannicobar.gov.in/')
  .split(',').map((s) => s.trim()).filter(Boolean)
const EXTRACT: ExtractOpt[] = ['tolet', 'sale', 'wanted']
const UA = 'Mozilla/5.0 (compatible; RoomlyArchiveBot/1.0; +https://github.com/)'
const MAX_PDF_BYTES = 80 * 1024 * 1024

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

interface Found { url: string; file: string; fileDate: string; stamp: string }

function log(...a: unknown[]) { console.log(new Date().toISOString(), ...a) }

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return { html: await res.text(), finalUrl: res.url || url }
}

/** e-paper files are named DDMMYYYY<time>.pdf, e.g. 10082026102721541.pdf */
function parseFileDate(file: string): { date: string; stamp: string } | null {
  const m = file.match(/^(\d{2})(\d{2})(\d{4})(\d*)\.pdf$/i)
  if (!m) return null
  const [, dd, mm, yyyy, rest] = m
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd))
  if (d.getUTCDate() !== +dd || d.getUTCMonth() !== +mm - 1) return null
  return { date: `${yyyy}-${mm}-${dd}`, stamp: rest }
}

function extractPdfLinks(html: string, base: string): string[] {
  const out = new Set<string>()
  const re = /(?:href|src|data-src|data-url|file)\s*=\s*["']([^"']+\.pdf)(?:\?[^"']*)?["']|["'(]((?:https?:)?\/{0,2}[^"'()\s<>]*epaper\/[^"'()\s<>]+\.pdf)/gi
  for (const m of html.matchAll(re)) {
    const raw = (m[1] || m[2] || '').replace(/&amp;/g, '&')
    try { out.add(new URL(raw, base).toString()) } catch { /* ignore */ }
  }
  return [...out]
}

/** Same-site pages that probably list editions (e-paper / archive links). */
function extractListingPages(html: string, base: string): string[] {
  const out = new Set<string>()
  const origin = new URL(base).origin
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1]; const label = m[2].replace(/<[^>]+>/g, ' ')
    if (/\.pdf($|\?)/i.test(href)) continue
    if (!/e-?paper|archive|edition|today|previous/i.test(href + ' ' + label)) continue
    try { const u = new URL(href, base); if (u.origin === origin) out.add(u.toString()) } catch { /* ignore */ }
  }
  return [...out].slice(0, 8)
}

async function discover(): Promise<Found[]> {
  const pdfs = new Set<string>()
  const visited = new Set<string>()
  const queue = [...SOURCES]
  let depth0 = SOURCES.length
  while (queue.length && visited.size < 12) {
    const url = queue.shift()!
    if (visited.has(url)) continue
    visited.add(url)
    try {
      const { html, finalUrl } = await fetchText(url)
      const links = extractPdfLinks(html, finalUrl)
      links.forEach((l) => pdfs.add(l))
      log(`scanned ${finalUrl}: ${links.length} pdf link(s)`)
      if (depth0-- > 0) extractListingPages(html, finalUrl).forEach((p) => queue.push(p))
    } catch (e) {
      log(`! could not read ${url}: ${(e as Error).message}`)
    }
  }
  const found: Found[] = []
  for (const url of pdfs) {
    const file = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
    const fd = parseFileDate(file)
    if (fd) found.push({ url, file, fileDate: fd.date, stamp: fd.stamp })
  }
  return found
}

/** Look for the masthead date ("Sunday, August 09, 2026" / "9th August 2026") on page 1. */
function mastheadDate(text: string, near: string): string | null {
  const head = text.slice(0, 4000)
  const pats = [
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi,
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december),?\s+(20\d{2})\b/gi,
  ]
  const nearT = Date.parse(near)
  for (const re of pats) {
    for (const m of head.matchAll(re)) {
      const [a, b, y] = [m[1], m[2], m[3]]
      const monthName = isNaN(+a) ? a : b
      const day = isNaN(+a) ? +b : +a
      const mi = MONTHS.indexOf(monthName.toLowerCase())
      const iso = `${y}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const t = Date.parse(iso)
      if (!isNaN(t) && Math.abs(t - nearT) <= 3 * 86400000) return iso
    }
  }
  return null
}

async function extractPdfTextNode(data: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise
  const parts: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    let lastY: number | null = null
    let line = ''
    const lines: string[] = [`[[page ${p}]]`]
    for (const item of content.items as Array<{ str?: string; transform?: number[]; height?: number; hasEOL?: boolean }>) {
      if (typeof item.str !== 'string' || !item.transform) continue
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim())
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

function editionName(date: string) {
  return `${NEWSPAPER} — ${new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!DRY_RUN && (!url || !key)) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const db = createClient(url || 'http://localhost', key || 'dry-run', { auth: { persistSession: false } })

  const found = await discover()
  if (!found.length) {
    throw new Error(`No e-paper PDF links found on ${SOURCES.join(', ')}. The site layout may have changed — set DT_SOURCE_URLS to the page that lists editions.`)
  }
  const dates = [...new Set(found.map((f) => f.fileDate))].sort().reverse().slice(0, DAYS)
  log(`latest edition dates on site: ${dates.join(', ')}`)

  const { data: existing, error: exErr } = DRY_RUN
    ? { data: [] as { id: string; edition_date: string; source_files: string[] }[], error: null }
    : await db.from('newspaper_publications').select('id, edition_date, source_files').eq('newspaper', NEWSPAPER)
  if (exErr) throw exErr
  const known = new Set((existing ?? []).flatMap((p) => p.source_files ?? []))

  let processed = 0, adsSaved = 0
  const failures: string[] = []
  for (const date of dates) {
    const files = found.filter((f) => f.fileDate === date).sort((a, b) => a.stamp.localeCompare(b.stamp))
    for (const f of files) {
      if (known.has(f.file)) { log(`= ${f.file} already in archive`); continue }
      try {
        log(`↓ ${f.url}`)
        const res = await fetch(f.url, { headers: { 'user-agent': UA } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const len = Number(res.headers.get('content-length') || 0)
        if (len > MAX_PDF_BYTES) throw new Error(`PDF too large (${len} bytes)`)
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('not a PDF')

        const { text, pages } = await extractPdfTextNode(bytes.slice())
        const editionDate = mastheadDate(text, f.fileDate) ?? f.fileDate
        const ads = parseClassifieds(text, EXTRACT)
        log(`  ${pages} page(s), edition ${editionDate}, ${ads.length} advert(s) found`)
        if (DRY_RUN) { ads.slice(0, 5).forEach((a) => log('   ·', a.configuration, '|', a.location_text.slice(0, 70), '|', a.phones.join(' '))); continue }

        const path = `auto/${editionDate}/${f.file}`
        const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true })
        if (up.error) throw up.error

        const { data: pub0 } = await db.from('newspaper_publications').select('id, source_files, pdf_path')
          .eq('newspaper', NEWSPAPER).eq('edition_date', editionDate).maybeSingle()
        let pubId: string
        if (pub0) {
          pubId = pub0.id
          const { error } = await db.from('newspaper_publications').update({
            source_files: [...new Set([...(pub0.source_files ?? []), f.file])],
            pdf_path: pub0.pdf_path ?? path, status: 'processing', fetched_at: new Date().toISOString(),
          }).eq('id', pubId)
          if (error) throw error
        } else {
          const { data: ins, error } = await db.from('newspaper_publications').insert({
            newspaper: NEWSPAPER, edition_date: editionDate, name: editionName(editionDate), source: 'auto',
            source_url: f.url, source_files: [f.file], pdf_path: path, page_count: pages, status: 'processing',
            fetched_at: new Date().toISOString(),
          }).select('id').single()
          if (error) throw error
          pubId = ins.id
        }

        let saved = 0
        for (const ad of ads) {
          const { error } = await db.from('newspaper_advertisements').insert({ ...ad, publication_id: pubId, extracted_page_path: null })
          if (!error) saved++
          else if (error.code !== '23505') log(`  ! advert insert failed: ${error.message}`)
        }
        await db.from('newspaper_publications').update({ status: 'processed', page_count: pages }).eq('id', pubId)
        known.add(f.file)
        processed++; adsSaved += saved
        log(`  ✓ saved ${saved} new advert(s)`)
      } catch (e) {
        failures.push(`${f.file}: ${(e as Error).message}`)
        log(`  ✗ ${f.file}: ${(e as Error).message}`)
      }
    }
  }
  log(`done: ${processed} new PDF(s), ${adsSaved} advert(s) saved${failures.length ? `, ${failures.length} failure(s)` : ''}`)
  if (failures.length && !processed) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exit(1) })

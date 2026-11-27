import { useState } from 'react'
import { toast } from 'sonner'
import { FileUp, Upload } from 'lucide-react'
import { supabase, BUCKETS } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/misc'
import { cn, errorMessage } from '@/lib/utils'
import { extractPdfText, ocrPdfPages, parseClassifieds, parsePageRange, type ExtractOpt, type ParsedAd } from '@/components/owner/parseClassifieds'

const OPTS: { value: ExtractOpt; label: string }[] = [
  { value: 'tolet', label: 'TO LET / Rent' },
  { value: 'sale', label: 'For sale' },
  { value: 'wanted', label: 'Wanted / Need' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'furnished', label: 'Furnished' },
  { value: 'all', label: 'All classifieds' },
]

/** Any signed-in user: upload an edition PDF/TXT, extract classifieds in the browser, review and save. */
export function ArchiveUploader({ onSaved }: { onSaved: () => void }) {
  const { user, isAdmin } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [newspaper, setNewspaper] = useState('Daily Telegrams')
  const [editionDate, setEditionDate] = useState(new Date().toISOString().slice(0, 10))
  const [opts, setOpts] = useState<Set<ExtractOpt>>(new Set(['tolet', 'sale', 'wanted']))
  const [status, setStatus] = useState<string | null>(null)
  const [pageRange, setPageRange] = useState('')
  const [publicationId, setPublicationId] = useState<string | null>(null)
  const [ownsPublication, setOwnsPublication] = useState(false)
  const [ads, setAds] = useState<ParsedAd[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  async function process() {
    if (!file || !user) return toast.error('Choose a PDF or TXT file')
    if (!editionDate) return toast.error('Choose the edition date')
    if (!opts.size) return toast.error('Pick at least one extraction option')
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isTxt = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
    if (!isPdf && !isTxt) return toast.error('Only PDF or TXT files are supported')
    if (file.size > 50 * 1024 * 1024) return toast.error('File is larger than 50 MB')
    let pubId: string | null = null
    let ownsPub = false
    try {
      setStatus('Uploading file…')
      const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-120)
      const path = `uploads/${user.id}/${editionDate}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from(BUCKETS.newspaperPdfs).upload(path, file, {
        contentType: isPdf ? 'application/pdf' : 'text/plain', upsert: false,
      })
      if (upErr) throw upErr

      setStatus('Creating edition record…')
      const paper = newspaper.trim() || 'Daily Telegrams'
      // Reuse the edition if it already exists (e.g. downloaded automatically); otherwise create it.
      const { data: existing, error: exErr } = await supabase.from('newspaper_publications')
        .select('id, uploaded_by').eq('newspaper', paper).eq('edition_date', editionDate).maybeSingle()
      if (exErr) throw exErr
      if (existing) {
        pubId = existing.id as string
        ownsPub = existing.uploaded_by === user.id || isAdmin
      } else {
        const { data: pub, error: pubErr } = await supabase.from('newspaper_publications').insert({
          newspaper: paper,
          edition_date: editionDate,
          name: `${paper} — ${new Date(editionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
          pdf_path: path,
          status: 'processing',
          source: 'upload',
          uploaded_by: user.id,
        }).select('id').single()
        if (pubErr) throw pubErr
        pubId = pub.id as string
        ownsPub = true
      }
      setOwnsPublication(ownsPub)
      setPublicationId(pubId)

      let text: string
      let pages: number | null = null
      let wanted: Set<number> | null = null
      let usedOcr = false
      if (isPdf) {
        const res = await extractPdfText(file, (p, t) => setStatus(`Reading text on page ${p} of ${t}…`))
        pages = res.pages
        text = res.text
        if (pageRange.trim()) wanted = new Set(parsePageRange(pageRange, res.pages))
        // Scanned pages have no text layer → read them with OCR
        const toOcr = res.imagePages.filter((p) => !wanted || wanted.has(p))
        if (toOcr.length) {
          usedOcr = true
          setStatus(`This paper is scanned — reading ${toOcr.length} page(s) with OCR. Loading reader…`)
          const ocrText = await ocrPdfPages(file, toOcr, ({ page, index, total, pct }) =>
            setStatus(`Reading scanned page ${page} (${index} of ${total})… ${pct}%`))
          text = `${text}\n\n${ocrText}`
        }
      } else {
        text = await file.text()
      }
      setStatus('Finding classifieds…')
      let parsed = parseClassifieds(text, [...opts])
      if (wanted) parsed = parsed.filter((a) => a.page_number == null || wanted!.has(a.page_number))
      if (ownsPub) await supabase.from('newspaper_publications').update({ page_count: pages, status: parsed.length ? 'processing' : 'failed' }).eq('id', pubId)
      setAds(parsed)
      setSelected(new Set(parsed.map((_, i) => i)))
      if (!parsed.length) {
        toast.warning(usedOcr
          ? 'No adverts found on the pages read. Check the page numbers of the classifieds section, or tick "All classifieds" and try again.'
          : 'No adverts found. Try ticking "All classifieds", or set the page numbers of the classifieds section.')
      } else {
        toast.success(`Found ${parsed.length} advert(s). Review and save.`)
      }
    } catch (e) {
      toast.error(errorMessage(e))
      if (pubId && ownsPub) await supabase.from('newspaper_publications').update({ status: 'failed' }).eq('id', pubId)
    } finally {
      setStatus(null)
    }
  }

  async function save() {
    if (!publicationId) return
    const rows = ads.filter((_, i) => selected.has(i))
    if (!rows.length) return toast.error('Select at least one advert')
    setStatus('Saving adverts…')
    let saved = 0, dup = 0
    const failed: string[] = []
    for (const ad of rows) {
      const { error } = await supabase.from('newspaper_advertisements').insert({ ...ad, publication_id: publicationId, created_by: user?.id })
      if (!error) saved++
      else if (error.code === '23505') dup++
      else failed.push(errorMessage(error))
    }
    if (ownsPublication) await supabase.from('newspaper_publications').update({ status: 'processed' }).eq('id', publicationId)
    setStatus(null)
    toast.success(`${saved} advert(s) saved${dup ? `, ${dup} duplicate(s) skipped` : ''}`)
    if (failed.length) toast.error(`${failed.length} failed`, { description: failed[0] })
    setAds([]); setSelected(new Set()); setFile(null); setPublicationId(null)
    onSaved()
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5" /> Upload a newspaper</CardTitle>
        <CardDescription>Have a paper we don't? Upload the PDF (or a TXT copy). Text is read in your browser, you review the adverts found, and they appear in the archive for everyone.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Newspaper" htmlFor="np-name"><Input id="np-name" value={newspaper} onChange={(e) => setNewspaper(e.target.value)} maxLength={80} /></Field>
          <Field label="Edition date" htmlFor="np-date"><Input id="np-date" type="date" value={editionDate} onChange={(e) => setEditionDate(e.target.value)} /></Field>
          <Field label="PDF or TXT file" htmlFor="np-file">
            <Input id="np-file" type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        </div>
        <Field label="Pages to read (optional)" htmlFor="np-pages" hint="e.g. 6-8 for the classifieds pages. Leave empty to read every page. Scanned pages take about 15–40 seconds each.">
          <Input id="np-pages" value={pageRange} onChange={(e) => setPageRange(e.target.value)} placeholder="All pages" inputMode="numeric" className="sm:max-w-xs" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {OPTS.map((o) => {
            const on = opts.has(o.value)
            return (
              <button key={o.value} type="button" aria-pressed={on}
                onClick={() => setOpts((prev) => { const s = new Set(prev); on ? s.delete(o.value) : s.add(o.value); return s })}
                className={cn('rounded-full border px-3 py-1 text-sm', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                {o.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void process()} loading={!!status && !ads.length} disabled={!file || (!!status)}><Upload /> Upload &amp; extract</Button>
          {status && <span className="text-sm text-muted-foreground" aria-live="polite">{status}</span>}
        </div>

        {ads.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{selected.size} of {ads.length} selected</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected(new Set(ads.map((_, i) => i)))}>Select all</Button>
                <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>None</Button>
                <Button size="sm" onClick={() => void save()} loading={!!status}>Save selected</Button>
              </div>
            </div>
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="p-2" /><th className="p-2">Type</th><th className="p-2">Config</th><th className="p-2">Location</th><th className="p-2">Phones</th><th className="p-2">Rent</th></tr>
                </thead>
                <tbody>
                  {ads.map((a, i) => (
                    <tr key={i} className="border-t align-top">
                      <td className="p-2">
                        <input type="checkbox" aria-label={`Select advert ${i + 1}`} checked={selected.has(i)}
                          onChange={(e) => setSelected((prev) => { const s = new Set(prev); e.target.checked ? s.add(i) : s.delete(i); return s })} />
                      </td>
                      <td className="p-2 capitalize">{a.ad_type}</td>
                      <td className="p-2">{a.configuration}</td>
                      <td className="p-2">{a.location_text || <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2 font-mono text-xs">{a.phones.join(', ')}</td>
                      <td className="p-2">{a.rent_text ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

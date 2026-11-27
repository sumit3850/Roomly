import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, FileText, MapPin, Newspaper, Phone, PlusCircle, Search, Trash2, X } from 'lucide-react'
import { supabase, BUCKETS, publicUrl } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, NativeSelect } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { ArchiveUploader } from '@/components/admin/ArchiveUploader'
import { errorMessage, formatDate } from '@/lib/utils'
import type { Advertisement, Publication } from '@/types/db'

const AD_TYPES = [
  { value: 'tolet', label: 'TO LET' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'sale', label: 'For sale' },
  { value: 'wanted', label: 'Wanted' },
  { value: 'other', label: 'Other' },
]
const ARCHIVE_CONFIGS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5+ BHK', 'Single Room', 'Commercial', 'Other']
const PAGE_SIZE = 300

function displayPhone(p: string) { return p.replace(/^\+91/, '') }

export default function NewspaperArchive() {
  useDocumentTitle('Newspaper TO LET archive')
  const { profile, isOwner, isAdmin, user } = useAuth()
  const [pubs, setPubs] = useState<Publication[]>([])
  const [ads, setAds] = useState<Advertisement[]>([])
  const [loading, setLoading] = useState(true)
  const [edition, setEdition] = useState('')
  const [adType, setAdType] = useState('')
  const [config, setConfig] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q.trim()), 300); return () => clearTimeout(t) }, [q])

  const loadPubs = useCallback(async () => {
    const { data, error } = await supabase.from('newspaper_publications').select('*').order('edition_date', { ascending: false })
    if (error) toast.error(errorMessage(error))
    setPubs((data ?? []) as Publication[])
  }, [])

  const loadAds = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('newspaper_advertisements').select('*').order('created_at', { ascending: false }).limit(PAGE_SIZE)
    if (edition) query = query.eq('publication_id', edition)
    if (adType) query = query.eq('ad_type', adType)
    if (config) query = query.eq('configuration', config)
    if (debouncedQ) {
      const digits = debouncedQ.replace(/\D/g, '')
      if (digits.length === 10 && /^[6-9]/.test(digits)) {
        query = query.contains('phones', [`+91${digits}`])
      } else {
        const safe = debouncedQ.replace(/[%,()*\\]/g, ' ').slice(0, 80)
        query = query.or(`location_text.ilike.%${safe}%,raw_text.ilike.%${safe}%`)
      }
    }
    const { data, error } = await query
    if (error) toast.error(errorMessage(error))
    setAds((data ?? []) as Advertisement[])
    setLoading(false)
  }, [edition, adType, config, debouncedQ])

  useEffect(() => { void loadPubs() }, [loadPubs])
  useEffect(() => { void loadAds() }, [loadAds])

  const pubById = useMemo(() => Object.fromEntries(pubs.map((p) => [p.id, p])), [pubs])
  const filtersOn = !!(edition || adType || config || q)

  function exportCsv() {
    const cols = ['#', 'Edition', 'Type', 'Configuration', 'Location', 'Phones', 'Rent', 'Advert text']
    const rows = ads.map((a, i) => [
      i + 1, pubById[a.publication_id]?.edition_date ?? '', a.ad_type, a.configuration ?? '', a.location_text ?? '',
      a.phones.map(displayPhone).join(' / '), a.rent_text ?? '', a.raw_text ?? '',
    ])
    const csv = [cols, ...rows].map((r) => r.map((v) => {
      const s = String(v ?? '').replace(/"/g, '""')
      return /[,"\n]/.test(s) ? `"${s}"` : s
    }).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `TO_LET_Archive_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${ads.length} adverts`)
  }

  async function deleteEdition(p: Publication) {
    if (p.pdf_path) {
      const { error } = await supabase.storage.from(BUCKETS.newspaperPdfs).remove([p.pdf_path])
      if (error) console.warn('PDF delete failed', error)
    }
    const { error } = await supabase.from('newspaper_publications').delete().eq('id', p.id)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Edition deleted')
    if (edition === p.id) setEdition('')
    await loadPubs(); await loadAds()
  }

  const myPhone = profile?.phone ?? null
  const latest = pubs.slice(0, 5)
  const manageable = isAdmin ? pubs : pubs.filter((p) => p.source === 'upload' && p.uploaded_by === user?.id)

  return (
    <div className="container py-6">
      <PageHeader
        title="Newspaper TO LET archive"
        description="TO LET classifieds from newspapers uploaded by users. The latest 5 editions are shown first."
        actions={<Button variant="outline" size="sm" onClick={exportCsv} disabled={!ads.length}><Download /> Export CSV</Button>}
      />

      {/* Latest 5 editions, downloaded automatically every day */}
      <section className="mb-6" aria-labelledby="latest-editions">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="latest-editions" className="text-lg font-semibold">Latest editions</h2>

        </div>
        {latest.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">No editions yet. Upload a newspaper PDF below and its TO LET adverts will appear here.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 lg:grid-cols-5">
            {latest.map((p) => {
              const active = edition === p.id
              const d = new Date(p.edition_date + 'T00:00:00')
              return (
                <button key={p.id} type="button" onClick={() => setEdition(active ? '' : p.id)} aria-pressed={active}
                  className={`min-w-[9.5rem] rounded-xl border p-3 text-left transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'}`}>
                  <div className="text-xs font-medium opacity-80">{d.toLocaleDateString('en-IN', { weekday: 'long' })}</div>
                  <div className="text-xl font-bold leading-tight">{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                  <div className="text-xs opacity-80">{d.getFullYear()} · {p.newspaper}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-semibold">{p.ad_count} advert{p.ad_count === 1 ? '' : 's'}</span>
                    {p.status !== 'processed' && <Badge variant="warning" className="px-1.5 py-0 text-[10px] capitalize">{p.status}</Badge>}
                  </div>
                  {p.pdf_path && (
                    <a href={publicUrl(BUCKETS.newspaperPdfs, p.pdf_path) ?? '#'} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                      className={`mt-2 inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline ${active ? '' : 'text-primary'}`}>
                      <FileText className="h-3.5 w-3.5" /> Read PDF
                    </a>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <div className="mb-6 space-y-4">
        {user ? (
          <ArchiveUploader onSaved={() => { void loadPubs(); void loadAds() }} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
            <span className="text-muted-foreground">Have a newspaper PDF that isn't here? Sign in to upload it — its TO LET adverts will be added to the archive.</span>
            <Button asChild size="sm" variant="outline"><Link to="/login?next=/newspaper">Sign in to upload</Link></Button>
          </div>
        )}
        {manageable.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">{isAdmin ? `All editions (${manageable.length})` : `Papers you uploaded (${manageable.length})`}</h3>
            <div className="space-y-2">
              {manageable.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0 last:pb-0">
                  <div>
                    <span className="font-medium">{p.name}</span>
                    <Badge variant={p.status === 'processed' ? 'success' : p.status === 'failed' ? 'destructive' : 'warning'} className="ml-2 capitalize">{p.status}</Badge>
                    <span className="ml-2 text-xs text-muted-foreground">{p.ad_count} adverts{p.page_count ? ` · ${p.page_count} pages` : ''}</span>
                  </div>
                  <ConfirmDialog title={`Delete ${p.name}?`} description="All adverts from this edition and its PDF will be permanently removed." destructive confirmLabel="Delete edition"
                    onConfirm={() => deleteEdition(p)}
                    trigger={(open) => <Button size="sm" variant="ghost" className="text-destructive" onClick={open}><Trash2 /> Delete</Button>} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search area, landmark or 10-digit phone" className="pl-9" aria-label="Search adverts" />
        </div>
        <NativeSelect value={edition} onChange={(e) => setEdition(e.target.value)} aria-label="Edition">
          <option value="">All editions</option>
          {pubs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
        <NativeSelect value={adType} onChange={(e) => setAdType(e.target.value)} aria-label="Advert type">
          <option value="">All types</option>
          {AD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </NativeSelect>
        <NativeSelect value={config} onChange={(e) => setConfig(e.target.value)} aria-label="Configuration">
          <option value="">Any configuration</option>
          {ARCHIVE_CONFIGS.map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
      </div>
      <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>{loading ? 'Loading…' : `${ads.length}${ads.length === PAGE_SIZE ? '+' : ''} advert${ads.length === 1 ? '' : 's'}`}</span>
        {filtersOn && (
          <Button variant="ghost" size="sm" onClick={() => { setEdition(''); setAdType(''); setConfig(''); setQ('') }}><X /> Clear filters</Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : !ads.length ? (
        <EmptyState icon={<Newspaper />} title={filtersOn ? 'No adverts match your filters' : 'The archive is empty'}
          description={filtersOn ? 'Try a different area or clear filters.' : 'Editions added by administrators will appear here.'} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ads.map((a) => {
            const pub = pubById[a.publication_id]
            const pdf = pub?.pdf_path ? publicUrl(BUCKETS.newspaperPdfs, pub.pdf_path) : null
            const canClaim = !!user && isOwner && !!myPhone && a.phones.includes(myPhone) && !a.linked_property_id
            return (
              <article key={a.id} className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  {a.configuration && <Badge>{a.configuration}</Badge>}
                  <Badge variant={a.ad_type === 'commercial' ? 'secondary' : 'outline'} className="capitalize">{AD_TYPES.find((t) => t.value === a.ad_type)?.label ?? a.ad_type}</Badge>
                  {a.is_furnished && <Badge variant="success">Furnished</Badge>}
                  {a.rent_text && <span className="ml-auto font-bold text-success">{a.rent_text}</span>}
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-sm">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{a.location_text || a.raw_text?.slice(0, 140) || 'Location not given'}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {a.phones.map((p) => (
                    <a key={p} href={`tel:${p}`} className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 font-mono text-xs text-primary hover:underline">
                      <Phone className="h-3 w-3" />{displayPhone(p)}
                    </a>
                  ))}
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
                  <span>{pub ? `${pub.newspaper} · ${formatDate(pub.edition_date)}` : '—'}{a.page_number ? ` · p.${a.page_number}` : ''}</span>
                  <div className="flex gap-2">
                    {pdf && <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><FileText className="h-3.5 w-3.5" /> PDF</a>}
                    {a.linked_property_id && <Link to={`/property/${a.linked_property_id}`} className="text-primary hover:underline">View listing</Link>}
                  </div>
                </div>
                {canClaim && (
                  <Button asChild size="sm" className="mt-3"><Link to={`/properties/new?fromAd=${a.id}`}><PlusCircle /> This is my advert — create listing</Link></Button>
                )}
              </article>
            )
          })}
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Archive adverts are reproduced from published newspaper classifieds and may be outdated. Owners whose verified profile phone matches an advert can turn it into a full listing.
      </p>
    </div>
  )
}

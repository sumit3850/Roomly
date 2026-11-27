import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Eye, FileText, Newspaper, Search, Trash2, Undo2, X } from 'lucide-react'
import { supabase, BUCKETS, publicUrl } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, Spinner } from '@/components/ui/misc'
import { ArchiveUploader } from '@/components/admin/ArchiveUploader'
import { cn, errorMessage } from '@/lib/utils'
import type { Advertisement, Publication } from '@/types/db'

type Status = 'Vacant' | 'Contacted' | 'Visited' | 'Filled'
const STATUSES: Status[] = ['Vacant', 'Contacted', 'Visited', 'Filled']
interface Tracking { advertisement_id: string; status: Status; notes: string; hidden: boolean }
interface Row extends Advertisement { status: Status; notes: string; hidden: boolean; edition: string; editionDate: string }

const TYPE_BADGE: Record<string, string> = {
  '1 BHK': 'bg-sky-100 text-sky-900', '2 BHK': 'bg-emerald-100 text-emerald-900', '3 BHK': 'bg-amber-100 text-amber-900',
  '4 BHK': 'bg-orange-100 text-orange-900', '5+ BHK': 'bg-orange-100 text-orange-900',
  'Single Room': 'bg-rose-100 text-rose-900', Commercial: 'bg-violet-100 text-violet-900',
}
const STATUS_STYLE: Record<Status, string> = {
  Vacant: 'border-emerald-400 bg-emerald-50 text-emerald-900',
  Contacted: 'border-sky-400 bg-sky-50 text-sky-900',
  Visited: 'border-amber-400 bg-amber-50 text-amber-900',
  Filled: 'border-rose-400 bg-rose-50 text-rose-900',
}
const SORT_KEYS = ['configuration', 'location_text', 'phones', 'rent_text', 'status', 'editionDate'] as const
type SortKey = (typeof SORT_KEYS)[number]

const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const showPhone = (p: string) => p.replace(/^\+91/, '')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export default function NewspaperArchive() {
  useDocumentTitle('TO LET Rental Tracker')
  const { user, isAdmin } = useAuth()
  const [pubs, setPubs] = useState<Publication[]>([])
  const [ads, setAds] = useState<Advertisement[]>([])
  const [tracking, setTracking] = useState<Record<string, Tracking>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('listings')
  const [typeF, setTypeF] = useState('')
  const [statusF, setStatusF] = useState('')
  const [editionF, setEditionF] = useState('')
  const [q, setQ] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [p, a] = await Promise.all([
      supabase.from('newspaper_publications').select('*').order('edition_date', { ascending: false }),
      supabase.from('newspaper_advertisements').select('*').order('created_at', { ascending: true }).limit(5000),
    ])
    if (p.error) toast.error(errorMessage(p.error))
    if (a.error) toast.error(errorMessage(a.error))
    setPubs((p.data ?? []) as Publication[])
    setAds((a.data ?? []) as Advertisement[])
    if (user) {
      const t = await supabase.from('newspaper_ad_tracking').select('advertisement_id, status, notes, hidden').eq('user_id', user.id)
      setTracking(Object.fromEntries(((t.data ?? []) as Tracking[]).map((r) => [r.advertisement_id, r])))
    } else {
      setTracking({})
    }
    setLoading(false)
  }, [user])

  useEffect(() => { void load() }, [load])

  const pubById = useMemo(() => Object.fromEntries(pubs.map((p) => [p.id, p])), [pubs])

  const rows: Row[] = useMemo(() => ads.map((a) => {
    const t = tracking[a.id]
    const pub = pubById[a.publication_id]
    return {
      ...a,
      status: t?.status ?? 'Vacant',
      notes: t?.notes ?? '',
      hidden: t?.hidden ?? false,
      edition: pub ? shortDate(pub.edition_date) : '—',
      editionDate: pub?.edition_date ?? '',
    }
  }), [ads, tracking, pubById])

  const visibleAll = rows.filter((r) => !r.hidden)
  const hiddenCount = rows.length - visibleAll.length
  const types = useMemo(() => [...new Set(rows.map((r) => r.configuration || 'Other'))].sort(), [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = (showHidden ? rows : visibleAll).filter((r) => {
      if (typeF && (r.configuration || 'Other') !== typeF) return false
      if (statusF && r.status !== statusF) return false
      if (editionF && r.publication_id !== editionF) return false
      if (needle) {
        const hay = `${r.location_text ?? ''} ${r.phones.join(' ')} ${r.configuration ?? ''} ${r.notes} ${r.edition} ${r.rent_text ?? ''} ${r.raw_text ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
    if (sort) {
      out = [...out].sort((a, b) => {
        const av = String(sort.key === 'phones' ? a.phones.join() : a[sort.key] ?? '').toLowerCase()
        const bv = String(sort.key === 'phones' ? b.phones.join() : b[sort.key] ?? '').toLowerCase()
        return av < bv ? -sort.dir : av > bv ? sort.dir : 0
      })
    }
    return out
  }, [rows, visibleAll, showHidden, typeF, statusF, editionF, q, sort])

  const filtersOn = !!(typeF || statusF || editionF || q)

  // ─── personal tracking (status / notes / hide) ─────────────────────
  async function saveTracking(adId: string, patch: Partial<Tracking>) {
    if (!user) { toast.info('Sign in to save status and notes'); return }
    const prev = tracking[adId]
    const base: Tracking = prev ?? { advertisement_id: adId, status: 'Vacant', notes: '', hidden: false }
    const next: Tracking = { ...base, ...patch }
    setTracking((t) => ({ ...t, [adId]: next }))
    const { error } = await supabase.from('newspaper_ad_tracking').upsert(
      { user_id: user.id, advertisement_id: adId, status: next.status, notes: next.notes, hidden: next.hidden },
      { onConflict: 'user_id,advertisement_id' },
    )
    if (error) {
      setTracking((t) => { const c = { ...t }; if (prev) c[adId] = prev; else delete c[adId]; return c })
      toast.error(errorMessage(error))
    }
  }

  const canDeleteAd = (a: Advertisement) => isAdmin || (!!user && a.created_by === user.id)
  const canDeletePub = (p: Publication) => isAdmin || (!!user && p.uploaded_by === user.id && p.source === 'upload')

  async function deleteRow(r: Row) {
    if (!user) { toast.info('Sign in to remove listings'); return }
    if (canDeleteAd(r)) {
      const { error } = await supabase.from('newspaper_advertisements').delete().eq('id', r.id)
      if (error) { toast.error(errorMessage(error)); return }
      setAds((list) => list.filter((x) => x.id !== r.id))
      toast.success('Listing deleted')
    } else {
      // someone else's paper: hide it from your list only
      await saveTracking(r.id, { hidden: true })
      toast.success('Listing hidden from your list')
    }
  }

  async function deletePaper(p: Publication) {
    if (p.pdf_path) {
      const { error } = await supabase.storage.from(BUCKETS.newspaperPdfs).remove([p.pdf_path])
      if (error) console.warn('PDF delete failed', error)
    }
    const { error } = await supabase.from('newspaper_publications').delete().eq('id', p.id)
    if (error) { toast.error(errorMessage(error)); return }
    setPubs((list) => list.filter((x) => x.id !== p.id))
    setAds((list) => list.filter((a) => a.publication_id !== p.id))
    if (editionF === p.id) setEditionF('')
    toast.success(`"${p.name}" and its listings were deleted`)
  }

  // ─── export ────────────────────────────────────────────────────────
  function exportExcel() {
    const cols = ['#', 'Type', 'Location', 'Phone No.', 'Rent', 'Status', 'Edition', 'Notes']
    const data = [cols, ...filtered.map((r, i) => [i + 1, r.configuration ?? '', r.location_text ?? '', r.phones.map(showPhone).join(' / '), r.rent_text ?? '', r.status, r.edition, r.notes])]
    const csv = data.map((row) => row.map((v) => {
      const s = String(v ?? '').replace(/"/g, '""')
      return /[,"\n]/.test(s) ? `"${s}"` : s
    }).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `TO_LET_Tracker_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    toast.success(`Excel file downloaded (${filtered.length} rows)`)
  }

  function exportPdf() {
    const body = filtered.map((r, i) => `<tr style="background:${i % 2 ? '#f7fafc' : '#fff'}">
      <td>${i + 1}</td><td><b>${esc(r.configuration ?? '')}</b></td><td>${esc(r.location_text ?? '')}</td>
      <td style="font-family:monospace;color:#2b6cb0">${esc(r.phones.map(showPhone).join(' / '))}</td>
      <td style="color:#2d7d4f;font-weight:700">${esc(r.rent_text ?? '')}</td><td>${r.status}</td><td>${esc(r.edition)}</td><td>${esc(r.notes)}</td></tr>`).join('')
    const w = window.open('', '_blank')
    if (!w) { toast.error('Allow pop-ups to export PDF'); return }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TO LET Rental Tracker</title>
      <style>body{font-family:Arial,sans-serif;margin:16px;color:#1a202c}h1{font-size:18px;color:#1a365d;margin:0 0 4px}p{font-size:12px;color:#718096;margin:0 0 12px}
      table{width:100%;border-collapse:collapse;font-size:12px}th{background:#2d3748;color:#fff;padding:6px;text-align:left}td{padding:5px 6px;border-bottom:1px solid #edf2f7;vertical-align:top}
      @media print{@page{size:A4 landscape;margin:10mm}}</style></head><body>
      <h1>TO LET Rental Tracker — Andaman &amp; Nicobar</h1><p>Exported ${new Date().toLocaleDateString('en-IN')} · ${filtered.length} listings</p>
      <table><thead><tr><th>#</th><th>Type</th><th>Location</th><th>Phone No.</th><th>Rent</th><th>Status</th><th>Edition</th><th>Notes</th></tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  }
  const Th = ({ k, children, className }: { k: SortKey; children: ReactNode; className?: string }) => (
    <th onClick={() => toggleSort(k)} className={cn('cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold tracking-wide hover:bg-slate-600', className)}>
      {children}{sort?.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const vacant = visibleAll.filter((r) => r.status === 'Vacant').length

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1a365d] to-[#2b6cb0] px-4 py-4 text-white">
        <div className="container px-0">
          <h1 className="text-xl font-bold">🏠 TO LET Rental Tracker</h1>
          <p className="text-xs opacity-80">Andaman &amp; Nicobar · Newspaper classifieds</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-white/20 px-3 py-1">{visibleAll.length} listings</span>
            <span className="rounded-full bg-white/20 px-3 py-1">{vacant} vacant</span>
            <span className="rounded-full bg-white/20 px-3 py-1">{filtered.length === visibleAll.length && !showHidden ? 'Showing all' : `Showing ${filtered.length}/${visibleAll.length}`}</span>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="border-b bg-card">
          <div className="container px-2">
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-none bg-transparent p-0">
              <TabsTrigger value="listings" className="rounded-none border-b-2 border-transparent py-3 data-[state=active]:border-primary data-[state=active]:shadow-none">📋 Listings</TabsTrigger>
              <TabsTrigger value="papers" className="rounded-none border-b-2 border-transparent py-3 data-[state=active]:border-primary data-[state=active]:shadow-none">📰 Papers ({pubs.length})</TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* ─── Listings ─── */}
        <TabsContent value="listings" className="mt-0">
          <div className="border-b bg-card">
            <div className="container space-y-2 px-3 py-3">
              <div className="grid grid-cols-3 gap-2">
                <NativeSelect value={typeF} onChange={(e) => setTypeF(e.target.value)} aria-label="Type">
                  <option value="">All types</option>
                  {types.map((t) => <option key={t}>{t}</option>)}
                </NativeSelect>
                <NativeSelect value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Status">
                  <option value="">All statuses</option>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </NativeSelect>
                <NativeSelect value={editionF} onChange={(e) => setEditionF(e.target.value)} aria-label="Edition">
                  <option value="">All editions</option>
                  {pubs.map((p) => <option key={p.id} value={p.id}>{shortDate(p.edition_date)}{p.newspaper !== 'Daily Telegrams' ? ` · ${p.newspaper}` : ''}</option>)}
                </NativeSelect>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search location, phone, area…" className="pl-9" aria-label="Search" />
                </div>
                <Button variant="outline" onClick={() => { setTypeF(''); setStatusF(''); setEditionF(''); setQ('') }} disabled={!filtersOn}><X /> Clear</Button>
              </div>
            </div>
          </div>
          <div className="border-b bg-muted/50">
            <div className="container flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="text-xs font-bold text-muted-foreground">Export:</span>
              <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={exportPdf} disabled={!filtered.length}>📄 PDF</Button>
              <Button size="sm" className="bg-green-800 text-white hover:bg-green-900" onClick={exportExcel} disabled={!filtered.length}>📊 Excel</Button>
              <span className="text-xs text-muted-foreground">{filtersOn ? `Exporting ${filtered.length} filtered rows` : `Exporting all ${filtered.length} rows`}</span>
              {hiddenCount > 0 && (
                <button onClick={() => setShowHidden((v) => !v)} className="ml-auto flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <Eye className="h-3.5 w-3.5" /> {showHidden ? 'Hide removed' : `Show ${hiddenCount} removed`}
                </button>
              )}
            </div>
          </div>

          <div className="container px-3 pt-3">
            {loading ? (
              <Spinner label="Loading listings…" />
            ) : rows.length === 0 ? (
              <EmptyState icon={<Newspaper />} title="No newspaper listings yet"
                description="Upload a newspaper PDF in the Papers tab. Its TO LET adverts will appear here."
                action={<Button onClick={() => setTab('papers')}>📰 Go to Papers</Button>} />
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No listings match your filters.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead className="bg-slate-700 text-white">
                    <tr>
                      <th className="px-3 py-2.5 text-center text-xs">#</th>
                      <Th k="configuration">Type</Th>
                      <Th k="location_text">Location / Area</Th>
                      <Th k="phones">Phone No.</Th>
                      <Th k="rent_text">Rent</Th>
                      <Th k="status">Status</Th>
                      <Th k="editionDate">Edition</Th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold">Notes</th>
                      <th className="px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={r.id} className={cn('border-b last:border-0 hover:bg-sky-50/60', r.hidden && 'opacity-50')}>
                        <td className="px-3 py-2 text-center text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className={cn('inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', TYPE_BADGE[r.configuration ?? ''] ?? 'bg-slate-200 text-slate-800')}>
                            {r.configuration || 'Other'}
                          </span>
                        </td>
                        <td className="min-w-[190px] max-w-[280px] px-3 py-2" title={r.raw_text ?? undefined}>{r.location_text || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 font-mono text-xs leading-5">
                          {r.phones.map((p, j) => (
                            <span key={p}>{j > 0 && <span className="text-muted-foreground"> / </span>}<a href={`tel:${p}`} className="text-blue-700 hover:underline">{showPhone(p)}</a></span>
                          ))}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-bold text-green-700">{r.rent_text ?? ''}</td>
                        <td className="px-3 py-2">
                          <select
                            value={r.status}
                            onChange={(e) => void saveTracking(r.id, { status: e.target.value as Status })}
                            className={cn('rounded-lg border-[1.5px] px-2 py-1 text-xs font-bold outline-none', STATUS_STYLE[r.status])}
                            aria-label="Status"
                          >
                            {STATUSES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{r.edition}</span></td>
                        <td className="min-w-[140px] px-3 py-2">
                          <input
                            key={`${r.id}:${r.notes}`}
                            defaultValue={r.notes}
                            placeholder="Note…"
                            maxLength={1000}
                            onBlur={(e) => { if (e.target.value !== r.notes) void saveTracking(r.id, { notes: e.target.value }) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs hover:border-input hover:bg-background focus:border-ring focus:bg-background focus:outline-none"
                            aria-label="Notes"
                          />
                        </td>
                        <td className="px-2 py-2">
                          {r.hidden ? (
                            <button onClick={() => void saveTracking(r.id, { hidden: false })} title="Restore" className="rounded-md p-1.5 text-primary hover:bg-accent"><Undo2 className="h-4 w-4" /></button>
                          ) : (
                            <ConfirmDialog
                              title="Delete this listing?"
                              description={canDeleteAd(r) ? 'It will be permanently removed from the tracker.' : 'This listing comes from a paper uploaded by someone else, so it will only be removed from your list.'}
                              destructive confirmLabel="Delete"
                              onConfirm={() => deleteRow(r)}
                              trigger={(open) => (
                                <button onClick={() => (user ? open() : toast.info('Sign in to remove listings'))} title="Delete listing" className="rounded-md p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!user && rows.length > 0 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                <Link to="/login?next=/newspaper" className="font-medium text-primary hover:underline">Sign in</Link> to save status &amp; notes and upload papers.
              </p>
            )}
          </div>
        </TabsContent>

        {/* ─── Papers ─── */}
        <TabsContent value="papers" className="mt-0">
          <div className="container space-y-4 px-3 py-4">
            {user ? (
              <ArchiveUploader onSaved={() => { void load(); setTab('listings') }} />
            ) : (
              <div className="rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 p-6 text-center">
                <p className="font-semibold text-sky-800">Upload newspaper PDF / TXT</p>
                <p className="mt-1 text-sm text-sky-700">Sign in to add papers. Their TO LET adverts are added to the Listings tab.</p>
                <Button asChild className="mt-3"><Link to="/login?next=/newspaper">Sign in to upload</Link></Button>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
                <h3 className="text-sm font-bold">📰 Loaded Papers</h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">{pubs.length} paper{pubs.length === 1 ? '' : 's'}</span>
              </div>
              {pubs.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No papers loaded yet.</p>
              ) : pubs.map((p) => {
                const count = ads.filter((a) => a.publication_id === p.id).length
                return (
                  <div key={p.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-lg">📄</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{p.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{shortDate(p.edition_date)}, {new Date(p.edition_date + 'T00:00:00').getFullYear()}</span>
                        <span className="rounded-full bg-emerald-100 px-2 font-bold text-emerald-900">{count} listings</span>
                        {user && p.uploaded_by === user.id && <span>· uploaded by you</span>}
                        {p.status === 'failed' && <span className="font-semibold text-destructive">· nothing extracted</span>}
                        {p.pdf_path && (
                          <a href={publicUrl(BUCKETS.newspaperPdfs, p.pdf_path) ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
                            · <FileText className="h-3 w-3" /> PDF
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => { setEditionF(p.id); setTab('listings') }}>View</Button>
                      {canDeletePub(p) && (
                        <ConfirmDialog
                          title={`Delete "${p.name}"?`}
                          description={`All ${count} listings from this paper will be removed from the tracker. This cannot be undone.`}
                          destructive confirmLabel="🗑 Delete"
                          onConfirm={() => deletePaper(p)}
                          trigger={(open) => <Button size="sm" variant="destructive" onClick={open}><Trash2 /> Delete</Button>}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>ℹ️ How it works:</strong> upload any edition of the newspaper. The app reads the classifieds (scanned papers too) and adds the TO LET adverts to the Listings tab. Deleting a paper removes all of its listings. Status and notes are saved to your account.
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

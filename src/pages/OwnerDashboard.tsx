import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  BarChart3, Building2, CheckCircle2, Eye, Home, ImageOff, KeyRound, MessageCircle, MessageSquare, Pencil, Phone,
  PlusCircle, Power, RotateCcw, Trash2, Mail,
} from 'lucide-react'
import { supabase, BUCKETS, publicUrl } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/layout/PageHeader'
import { ToLetButton } from '@/components/layout/ToLetButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm'
import { EmptyState, Field, Spinner, StatCard } from '@/components/ui/misc'
import { errorMessage, formatDate, formatINR, timeAgo } from '@/lib/utils'
import type { Enquiry, EnquiryStatus, Listing, Profile, PropertyStatus, RentalTransaction } from '@/types/db'

type TabKey = 'listings' | 'enquiries' | 'rentals' | 'analytics'
type EnquiryRow = Enquiry & { tenant?: Pick<Profile, 'id' | 'full_name' | 'phone' | 'email'> | null }

const statusVariant: Record<PropertyStatus, 'success' | 'warning' | 'muted' | 'destructive'> = {
  active: 'success', draft: 'warning', inactive: 'muted', rented: 'destructive',
}
const enquiryVariant: Record<EnquiryStatus, 'warning' | 'success' | 'muted'> = { new: 'warning', responded: 'success', closed: 'muted' }

function waLink(phone: string) { return `https://wa.me/${phone.replace(/\D/g, '')}` }

export default function OwnerDashboard() {
  useDocumentTitle('Owner dashboard')
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (['listings', 'enquiries', 'rentals', 'analytics'].includes(params.get('tab') ?? '') ? params.get('tab') : 'listings') as TabKey

  const [listings, setListings] = useState<Listing[]>([])
  const [enquiries, setEnquiries] = useState<EnquiryRow[]>([])
  const [rentals, setRentals] = useState<RentalTransaction[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    const [l, e, r] = await Promise.all([
      supabase.from('property_listings').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
      supabase.from('property_enquiries').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
      supabase.from('rental_transactions').select('*').eq('owner_id', user.id).order('start_date', { ascending: false }),
    ])
    if (l.error) toast.error(errorMessage(l.error))
    if (e.error) toast.error(errorMessage(e.error))
    const enq = (e.data ?? []) as Enquiry[]
    const tenantIds = [...new Set(enq.map((x) => x.tenant_id))]
    let tenants: Record<string, EnquiryRow['tenant']> = {}
    if (tenantIds.length) {
      const { data } = await supabase.from('profiles').select('id, full_name, phone, email').in('id', tenantIds)
      tenants = Object.fromEntries(((data ?? []) as Pick<Profile, 'id' | 'full_name' | 'phone' | 'email'>[]).map((t) => [t.id, t]))
    }
    setListings((l.data ?? []) as Listing[])
    setEnquiries(enq.map((x) => ({ ...x, tenant: tenants[x.tenant_id] ?? null })))
    setRentals((r.data ?? []) as RentalTransaction[])
    setLoading(false)
  }, [user])

  useEffect(() => { void load() }, [load])

  const titleById = useMemo(() => Object.fromEntries(listings.map((l) => [l.id, l.title])), [listings])
  const enquiryCount = useMemo(() => {
    const m: Record<string, number> = {}
    enquiries.forEach((e) => { m[e.property_id] = (m[e.property_id] ?? 0) + 1 })
    return m
  }, [enquiries])

  const stats = useMemo(() => {
    const responded = enquiries.filter((e) => e.owner_response).length
    return {
      total: listings.length,
      active: listings.filter((l) => l.status === 'active').length,
      rented: listings.filter((l) => l.status === 'rented').length,
      views: listings.reduce((s, l) => s + (l.views_count ?? 0), 0),
      enquiries: enquiries.length,
      newEnquiries: enquiries.filter((e) => e.status === 'new').length,
      responseRate: enquiries.length ? Math.round((responded / enquiries.length) * 100) : null,
    }
  }, [listings, enquiries])

  if (loading) return <Spinner label="Loading your dashboard…" />

  return (
    <div className="container py-6">
      <PageHeader
        title="Owner dashboard"
        description="Manage your listings, enquiries and tenancies."
        actions={<Button asChild><Link to="/properties/new"><PlusCircle /> Add property</Link></Button>}
      />
      <ToLetButton className="mb-6" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Listings" value={stats.total} icon={<Building2 />} />
        <StatCard label="Active" value={stats.active} icon={<Home />} />
        <StatCard label="Total views" value={stats.views.toLocaleString('en-IN')} icon={<Eye />} />
        <StatCard label="New enquiries" value={stats.newEnquiries} icon={<MessageSquare />} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="listings">Listings ({listings.length})</TabsTrigger>
          <TabsTrigger value="enquiries">Enquiries {stats.newEnquiries > 0 && <Badge variant="destructive" className="px-1.5">{stats.newEnquiries}</Badge>}</TabsTrigger>
          <TabsTrigger value="rentals">Rentals</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="listings">
          <ListingsTab listings={listings} enquiryCount={enquiryCount} enquiries={enquiries} onChange={load} />
        </TabsContent>
        <TabsContent value="enquiries">
          <EnquiriesTab enquiries={enquiries} titleById={titleById} onChange={load} />
        </TabsContent>
        <TabsContent value="rentals">
          <RentalsTab rentals={rentals} titleById={titleById} enquiries={enquiries} onChange={load} />
        </TabsContent>
        <TabsContent value="analytics">
          <AnalyticsTab listings={listings} enquiryCount={enquiryCount} stats={stats} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Listings ────────────────────────────────────────────────────────────
function ListingsTab({ listings, enquiryCount, enquiries, onChange }: {
  listings: Listing[]; enquiryCount: Record<string, number>; enquiries: EnquiryRow[]; onChange: () => Promise<void>
}) {
  const { user } = useAuth()
  const [rentTarget, setRentTarget] = useState<Listing | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function setStatus(l: Listing, status: PropertyStatus) {
    setBusyId(l.id)
    const { error } = await supabase.from('properties').update({ status }).eq('id', l.id)
    setBusyId(null)
    if (error) return toast.error(errorMessage(error))
    toast.success(status === 'active' ? 'Listing is live' : 'Listing deactivated')
    await onChange()
  }

  async function relist(l: Listing) {
    setBusyId(l.id)
    const { error } = await supabase.rpc('relist_property', { _property_id: l.id })
    setBusyId(null)
    if (error) return toast.error(errorMessage(error))
    toast.success('Listing is available again')
    await onChange()
  }

  async function remove(l: Listing) {
    if (!user) return
    const folder = `${user.id}/${l.id}`
    const { data: files } = await supabase.storage.from(BUCKETS.propertyImages).list(folder, { limit: 100 })
    if (files?.length) {
      const { error: sErr } = await supabase.storage.from(BUCKETS.propertyImages).remove(files.map((f) => `${folder}/${f.name}`))
      if (sErr) console.warn('image cleanup failed', sErr)
    }
    const { error } = await supabase.from('properties').delete().eq('id', l.id)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Listing deleted')
    await onChange()
  }

  if (!listings.length) {
    return (
      <EmptyState icon={<Building2 />} title="No listings yet" description="Add your first property — it takes about two minutes."
        action={<Button asChild><Link to="/properties/new"><PlusCircle /> Add property</Link></Button>} />
    )
  }

  return (
    <>
      <div className="space-y-3">
        {listings.map((l) => {
          const img = publicUrl(BUCKETS.propertyImages, l.cover_path)
          return (
            <div key={l.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row">
              <Link to={`/property/${l.id}`} className="block h-36 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-36">
                {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff /></div>}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant[l.status]} className="capitalize">{l.status}</Badge>
                  <Badge variant="outline">{l.configuration}</Badge>
                  {l.is_verified && <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Verified</Badge>}
                </div>
                <Link to={`/property/${l.id}`} className="mt-1 block truncate font-semibold hover:underline">{l.title}</Link>
                <p className="text-sm text-muted-foreground">{[l.area, l.island].filter(Boolean).join(', ')} · {formatINR(l.rent_amount)}/mo</p>
                <p className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{l.views_count} views</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{enquiryCount[l.id] ?? 0} enquiries</span>
                  <span>Listed {formatDate(l.created_at)}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2 sm:w-56 sm:justify-end">
                <Button asChild size="sm" variant="outline"><Link to={`/properties/${l.id}/edit`}><Pencil /> Edit</Link></Button>
                {l.status === 'active' && (
                  <>
                    <Button size="sm" variant="success" onClick={() => setRentTarget(l)}><KeyRound /> Mark rented</Button>
                    <Button size="sm" variant="outline" loading={busyId === l.id} onClick={() => void setStatus(l, 'inactive')}><Power /> Deactivate</Button>
                  </>
                )}
                {(l.status === 'inactive' || l.status === 'draft') && (
                  <Button size="sm" loading={busyId === l.id} onClick={() => void setStatus(l, 'active')}><Power /> {l.status === 'draft' ? 'Publish' : 'Activate'}</Button>
                )}
                {l.status === 'rented' && (
                  <Button size="sm" variant="outline" loading={busyId === l.id} onClick={() => void relist(l)}><RotateCcw /> Relist</Button>
                )}
                <ConfirmDialog
                  title="Delete this listing?"
                  description="This permanently removes the listing, its photos, enquiries and reviews. Consider deactivating instead."
                  confirmLabel="Delete permanently"
                  destructive
                  onConfirm={() => remove(l)}
                  trigger={(open) => <Button size="sm" variant="ghost" className="text-destructive" onClick={open}><Trash2 /> Delete</Button>}
                />
              </div>
            </div>
          )
        })}
      </div>
      <MarkRentedDialog listing={rentTarget} enquiries={enquiries.filter((e) => e.property_id === rentTarget?.id)} onClose={() => setRentTarget(null)} onDone={onChange} />
    </>
  )
}

function MarkRentedDialog({ listing, enquiries, onClose, onDone }: {
  listing: Listing | null; enquiries: EnquiryRow[]; onClose: () => void; onDone: () => Promise<void>
}) {
  const [enquiryId, setEnquiryId] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  useEffect(() => { setEnquiryId(''); setTenantName(''); setStartDate(new Date().toISOString().slice(0, 10)) }, [listing?.id])

  async function submit() {
    if (!listing) return
    const enq = enquiries.find((e) => e.id === enquiryId)
    setBusy(true)
    const { error } = await supabase.rpc('mark_property_rented', {
      _property_id: listing.id,
      _tenant_name: tenantName.trim() || enq?.tenant?.full_name || null,
      _tenant_id: enq?.tenant_id ?? null,
      _enquiry_id: enq?.id ?? null,
      _start_date: startDate || null,
    })
    setBusy(false)
    if (error) return toast.error(errorMessage(error))
    toast.success('Marked as rented. Open enquiries were closed.')
    onClose()
    await onDone()
  }

  return (
    <Dialog open={!!listing} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as rented</DialogTitle>
          <DialogDescription>{listing?.title}. The listing stops accepting enquiries; a rental record is created.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {enquiries.length > 0 && (
            <Field label="Rented to an enquirer? (lets them leave a verified review)" htmlFor="rent-enq">
              <NativeSelect id="rent-enq" value={enquiryId} onChange={(e) => setEnquiryId(e.target.value)}>
                <option value="">— Someone else / offline tenant —</option>
                {enquiries.map((e) => <option key={e.id} value={e.id}>{e.tenant?.full_name || 'Tenant'} · {formatDate(e.created_at)}</option>)}
              </NativeSelect>
            </Field>
          )}
          <Field label="Tenant name (optional)" htmlFor="rent-name">
            <Input id="rent-name" value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="For your records" maxLength={120} />
          </Field>
          <Field label="Tenancy start date" htmlFor="rent-start">
            <Input id="rent-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="success" loading={busy} onClick={() => void submit()}>Confirm rented</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Enquiries ───────────────────────────────────────────────────────────
function EnquiriesTab({ enquiries, titleById, onChange }: { enquiries: EnquiryRow[]; titleById: Record<string, string>; onChange: () => Promise<void> }) {
  const [filter, setFilter] = useState<'all' | EnquiryStatus>('all')
  const [responding, setResponding] = useState<EnquiryRow | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const shown = enquiries.filter((e) => filter === 'all' || e.status === filter)

  async function sendReply() {
    if (!responding) return
    const text = reply.trim()
    if (text.length < 2) return toast.error('Write a reply first')
    setBusy(true)
    const { error } = await supabase.from('property_enquiries').update({ owner_response: text }).eq('id', responding.id)
    setBusy(false)
    if (error) return toast.error(errorMessage(error))
    toast.success('Reply sent — the tenant has been notified')
    setResponding(null)
    await onChange()
  }

  async function close(e: EnquiryRow) {
    const { error } = await supabase.from('property_enquiries').update({ status: 'closed' }).eq('id', e.id)
    if (error) return toast.error(errorMessage(error))
    toast.success('Enquiry closed')
    await onChange()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['all', 'new', 'responded', 'closed'] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)} className="capitalize">
            {f} ({f === 'all' ? enquiries.length : enquiries.filter((e) => e.status === f).length})
          </Button>
        ))}
      </div>
      {!shown.length && <EmptyState icon={<MessageSquare />} title="No enquiries here" description="When tenants contact you about a listing, it shows up here." />}
      {shown.map((e) => {
        const phone = e.contact_phone || e.tenant?.phone
        return (
          <div key={e.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{e.tenant?.full_name || 'Tenant'}</p>
                <Link to={`/property/${e.property_id}`} className="text-sm text-primary hover:underline">{titleById[e.property_id] ?? 'Property'}</Link>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={enquiryVariant[e.status]} className="capitalize">{e.status}</Badge>
                <span className="text-xs text-muted-foreground">{timeAgo(e.created_at)}</span>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm">{e.message}</p>
            {e.preferred_visit_date && <p className="mt-1 text-xs text-muted-foreground">Preferred visit: {formatDate(e.preferred_visit_date)}</p>}
            {e.owner_response && (
              <div className="mt-3 rounded-lg bg-accent p-3 text-sm">
                <p className="text-xs font-semibold text-muted-foreground">Your reply · {e.responded_at ? timeAgo(e.responded_at) : ''}</p>
                <p className="whitespace-pre-line">{e.owner_response}</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {phone && <Button asChild size="sm" variant="outline"><a href={`tel:${phone}`}><Phone /> Call</a></Button>}
              {phone && <Button asChild size="sm" variant="outline"><a href={waLink(phone)} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>}
              {e.tenant?.email && <Button asChild size="sm" variant="outline"><a href={`mailto:${e.tenant.email}`}><Mail /> Email</a></Button>}
              {e.status !== 'closed' && (
                <>
                  <Button size="sm" onClick={() => { setResponding(e); setReply(e.owner_response ?? '') }}>{e.owner_response ? 'Edit reply' : 'Respond'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void close(e)}>Close</Button>
                </>
              )}
            </div>
          </div>
        )
      })}

      <Dialog open={!!responding} onOpenChange={(o) => { if (!o) setResponding(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to {responding?.tenant?.full_name || 'tenant'}</DialogTitle>
            <DialogDescription className="line-clamp-3">{responding?.message}</DialogDescription>
          </DialogHeader>
          <Textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} placeholder="e.g. Yes, it's available. You can visit on Sunday at 11am." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponding(null)} disabled={busy}>Cancel</Button>
            <Button loading={busy} onClick={() => void sendReply()}>Send reply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Rentals ─────────────────────────────────────────────────────────────
function RentalsTab({ rentals, titleById, enquiries, onChange }: {
  rentals: RentalTransaction[]; titleById: Record<string, string>; enquiries: EnquiryRow[]; onChange: () => Promise<void>
}) {
  const tenantName = (r: RentalTransaction) =>
    r.tenant_name || enquiries.find((e) => e.tenant_id === r.tenant_id)?.tenant?.full_name || (r.tenant_id ? 'Registered tenant' : '—')

  async function endTenancy(r: RentalTransaction) {
    const { error } = await supabase.from('rental_transactions')
      .update({ status: 'ended', end_date: new Date().toISOString().slice(0, 10) }).eq('id', r.id)
    if (error) return toast.error(errorMessage(error))
    toast.success('Tenancy ended. Use "Relist" on the listing to make it available again.')
    await onChange()
  }

  if (!rentals.length) return <EmptyState icon={<KeyRound />} title="No rentals recorded" description='Use "Mark rented" on a listing to record a tenancy.' />
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
          <tr><th className="p-3">Property</th><th className="p-3">Tenant</th><th className="p-3">Rent</th><th className="p-3">Deposit</th><th className="p-3">Period</th><th className="p-3">Status</th><th className="p-3" /></tr>
        </thead>
        <tbody>
          {rentals.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-3"><Link to={`/property/${r.property_id}`} className="font-medium hover:underline">{titleById[r.property_id] ?? 'Property'}</Link></td>
              <td className="p-3">{tenantName(r)}</td>
              <td className="p-3">{formatINR(r.monthly_rent)}</td>
              <td className="p-3">{formatINR(r.security_deposit)}</td>
              <td className="p-3">{formatDate(r.start_date)} – {r.end_date ? formatDate(r.end_date) : 'ongoing'}</td>
              <td className="p-3"><Badge variant={r.status === 'active' ? 'success' : 'muted'} className="capitalize">{r.status}</Badge></td>
              <td className="p-3 text-right">
                {r.status === 'active' && (
                  <ConfirmDialog title="End this tenancy?" confirmLabel="End tenancy" onConfirm={() => endTenancy(r)}
                    trigger={(open) => <Button size="sm" variant="outline" onClick={open}>End</Button>} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Analytics ───────────────────────────────────────────────────────────
function AnalyticsTab({ listings, enquiryCount, stats }: {
  listings: Listing[]; enquiryCount: Record<string, number>
  stats: { total: number; active: number; rented: number; views: number; enquiries: number; responseRate: number | null }
}) {
  const maxViews = Math.max(1, ...listings.map((l) => l.views_count))
  const sorted = [...listings].sort((a, b) => b.views_count - a.views_count)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total listings" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Rented" value={stats.rented} />
        <StatCard label="Views" value={stats.views.toLocaleString('en-IN')} />
        <StatCard label="Enquiries" value={stats.enquiries} />
        <StatCard label="Response rate" value={stats.responseRate === null ? '—' : `${stats.responseRate}%`} />
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4" /> Views per listing</h3>
        {!sorted.length && <p className="text-sm text-muted-foreground">No data yet.</p>}
        <div className="space-y-3">
          {sorted.map((l) => (
            <div key={l.id}>
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <Link to={`/property/${l.id}`} className="truncate hover:underline">{l.title}</Link>
                <span className="shrink-0 tabular-nums text-muted-foreground">{l.views_count} views · {enquiryCount[l.id] ?? 0} enq.</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(l.views_count / maxViews) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Views are counted once per page visit by anyone other than you.</p>
      </div>
    </div>
  )
}

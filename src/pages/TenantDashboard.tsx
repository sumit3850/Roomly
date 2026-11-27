import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Heart, KeyRound, MessageSquare, MessageSquareReply, Search, Sparkles, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useSaved } from '@/hooks/useSaved'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/layout/PageHeader'
import { ToLetButton } from '@/components/layout/ToLetButton'
import { PropertyCard, PropertyCardSkeleton } from '@/components/property/PropertyCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { StatCard } from '@/components/ui/misc'
import { fetchListingsByIds, orSafe } from '@/components/tenant/listingQuery'
import { formatDate, timeAgo } from '@/lib/utils'
import type { Enquiry, Listing, RentalTransaction } from '@/types/db'
import { enquiryBadge } from '@/components/tenant/enquiryBadge'

export default function TenantDashboard() {
  useDocumentTitle('Tenant dashboard')
  const { user, profile, isOwner } = useAuth()
  const navigate = useNavigate()
  const { savedIds, toggleSaved } = useSaved()
  const [saved, setSaved] = useState<Listing[] | null>(null)
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [enqListings, setEnqListings] = useState<Map<string, Listing>>(new Map())
  const [recs, setRecs] = useState<Listing[] | null>(null)
  const [rentals, setRentals] = useState<(RentalTransaction & { listing?: Listing })[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!user) return
    let active = true
    ;(async () => {
      const [s, e, t] = await Promise.all([
        supabase.from('saved_properties').select('property_id').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('property_enquiries').select('*').eq('tenant_id', user.id).order('created_at', { ascending: false }),
        supabase.from('rental_transactions').select('*').eq('tenant_id', user.id).order('start_date', { ascending: false }),
      ])
      const savedIdList = ((s.data ?? []) as { property_id: string }[]).map((r) => r.property_id)
      const enqs = (e.data ?? []) as Enquiry[]
      const txs = (t.data ?? []) as RentalTransaction[]
      const all = await fetchListingsByIds([...new Set([...savedIdList, ...enqs.map((x) => x.property_id), ...txs.map((x) => x.property_id)])]).catch(() => [] as Listing[])
      const byId = new Map(all.map((l) => [l.id, l]))
      if (!active) return
      const savedListings = savedIdList.map((id) => byId.get(id)).filter(Boolean) as Listing[]
      setSaved(savedListings)
      setEnquiries(enqs)
      setEnqListings(byId)
      setRentals(txs.map((x) => ({ ...x, listing: byId.get(x.property_id) })))

      // Recommendations: preferred location + configurations the user saved
      const exclude = new Set([...savedIdList, ...enqs.map((x) => x.property_id)])
      const configs = [...new Set(savedListings.map((l) => l.configuration))]
      let rq = supabase.from('property_listings').select('*').eq('status', 'active').neq('owner_id', user.id)
      const loc = orSafe(profile?.preferred_location ?? '')
      if (loc) rq = rq.or(`area.ilike.%${loc}%,island.ilike.%${loc}%,landmark.ilike.%${loc}%`)
      if (configs.length) rq = rq.in('configuration', configs)
      const { data: r } = await rq.order('created_at', { ascending: false }).limit(20)
      let list = ((r ?? []) as Listing[]).filter((l) => !exclude.has(l.id))
      if (list.length < 4) {
        const { data: fb } = await supabase.from('property_listings').select('*').eq('status', 'active').neq('owner_id', user.id).order('views_count', { ascending: false }).limit(20)
        const seen = new Set(list.map((l) => l.id))
        list = [...list, ...((fb ?? []) as Listing[]).filter((l) => !exclude.has(l.id) && !seen.has(l.id))]
      }
      if (active) setRecs(list.slice(0, 8))
    })()
    return () => { active = false }
  }, [user, profile?.preferred_location])

  function search(e: FormEvent) {
    e.preventDefault()
    navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search')
  }

  const open = enquiries.filter((e) => e.status === 'new').length
  const replied = enquiries.filter((e) => e.status === 'responded').length
  const firstName = profile?.full_name?.split(' ')[0]

  return (
    <div className="container py-6">
      <PageHeader title={`Hello${firstName ? `, ${firstName}` : ''} 👋`} description="Your home search at a glance."
        actions={isOwner ? <Button asChild variant="outline"><Link to="/dashboard/owner"><Building2 /> Owner dashboard</Link></Button> : undefined} />
      <ToLetButton className="mb-6" />

      <form onSubmit={search} className="mb-6 flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by area, landmark or island…" aria-label="Quick search" />
        <Button type="submit"><Search /> Search</Button>
      </form>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Saved" value={saved?.length ?? '—'} icon={<Heart />} />
        <StatCard label="Enquiries" value={enquiries.length} icon={<MessageSquare />} />
        <StatCard label="Awaiting reply" value={open} icon={<KeyRound />} />
        <StatCard label="Owner replies" value={replied} icon={<MessageSquareReply />} />
      </div>

      {!isOwner && (
        <div className="mb-8 flex flex-col items-start gap-3 rounded-xl border bg-secondary p-4 sm:flex-row sm:items-center">
          <Building2 className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <p className="font-semibold">Have a property to rent out?</p>
            <p className="text-sm text-muted-foreground">Turn on the owner role — you can be a tenant and an owner with the same account.</p>
          </div>
          <Button asChild><Link to="/profile?tab=account">Become an owner</Link></Button>
        </div>
      )}

      {rentals.length > 0 && (
        <Card className="mb-8">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Star className="h-4 w-4 text-amber-500" /> Your rentals — leave a verified review</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {rentals.map((r) => (
              <Link key={r.id} to={`/property/${r.property_id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-accent">
                <span className="font-medium">{r.listing?.title ?? 'Property'}</span>
                <span className="text-muted-foreground">Since {formatDate(r.start_date)} · <Badge variant={r.status === 'active' ? 'success' : 'muted'}>{r.status}</Badge></span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="h-5 w-5 text-primary" /> Recommended for you</h2>
          {!profile?.preferred_location && <Link to="/profile" className="text-sm text-primary hover:underline">Set preferred location</Link>}
        </div>
        {recs === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <PropertyCardSkeleton key={i} />)}</div>
        ) : recs.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No recommendations yet — new listings will appear here.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recs.map((l) => <PropertyCard key={l.id} listing={l} saved={savedIds.has(l.id)} onToggleSave={toggleSaved} />)}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent enquiries</CardTitle>
            <Link to="/enquiries" className="flex items-center gap-1 text-sm text-primary hover:underline">All <ArrowRight className="h-4 w-4" /></Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {enquiries.length === 0 && <p className="text-sm text-muted-foreground">You haven't contacted any owners yet.</p>}
            {enquiries.slice(0, 5).map((e) => (
              <Link key={e.id} to="/enquiries" className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:bg-accent">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{enqListings.get(e.property_id)?.title ?? 'Property'}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(e.created_at)}</span>
                </span>
                <Badge variant={enquiryBadge[e.status].variant}>{enquiryBadge[e.status].label}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Saved properties</CardTitle>
            <Link to="/saved" className="flex items-center gap-1 text-sm text-primary hover:underline">All <ArrowRight className="h-4 w-4" /></Link>
          </CardHeader>
          <CardContent>
            {saved && saved.length === 0 && <p className="text-sm text-muted-foreground">Save properties to compare them later.</p>}
            <div className="grid grid-cols-2 gap-3">
              {saved?.slice(0, 4).map((l) => <PropertyCard key={l.id} listing={l} compact saved onToggleSave={async (id) => { await toggleSaved(id); setSaved((cur) => cur?.filter((x) => x.id !== id) ?? null) }} />)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

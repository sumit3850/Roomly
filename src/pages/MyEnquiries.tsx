import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageOff, MessageSquare, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, BUCKETS, publicUrl } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm'
import { EmptyState, Spinner } from '@/components/ui/misc'
import { fetchListingsByIds } from '@/components/tenant/listingQuery'
import { errorMessage, formatDate, formatINR, timeAgo } from '@/lib/utils'
import type { Enquiry, EnquiryStatus, Listing } from '@/types/db'
import { enquiryBadge } from '@/components/tenant/enquiryBadge'

export default function MyEnquiries() {
  useDocumentTitle('My enquiries')
  const { user } = useAuth()
  const [enquiries, setEnquiries] = useState<Enquiry[] | null>(null)
  const [listings, setListings] = useState<Map<string, Listing>>(new Map())
  const [tab, setTab] = useState<'all' | EnquiryStatus>('all')

  useEffect(() => {
    if (!user) return
    let active = true
    ;(async () => {
      const { data, error } = await supabase.from('property_enquiries').select('*').eq('tenant_id', user.id).order('created_at', { ascending: false })
      if (error) { toast.error(errorMessage(error)); setEnquiries([]); return }
      const rows = (data ?? []) as Enquiry[]
      const ls = await fetchListingsByIds([...new Set(rows.map((r) => r.property_id))]).catch(() => [] as Listing[])
      if (!active) return
      setListings(new Map(ls.map((l) => [l.id, l])))
      setEnquiries(rows)
    })()
    return () => { active = false }
  }, [user])

  const shown = useMemo(() => (enquiries ?? []).filter((e) => tab === 'all' || e.status === tab), [enquiries, tab])
  const counts = useMemo(() => {
    const c = { all: 0, new: 0, responded: 0, closed: 0 }
    enquiries?.forEach((e) => { c.all++; c[e.status]++ })
    return c
  }, [enquiries])

  async function close(id: string) {
    const { error } = await supabase.from('property_enquiries').update({ status: 'closed' }).eq('id', id)
    if (error) { toast.error(errorMessage(error)); return }
    setEnquiries((cur) => cur?.map((e) => (e.id === id ? { ...e, status: 'closed' } : e)) ?? null)
    toast.success('Enquiry closed')
  }
  async function remove(id: string) {
    const { error } = await supabase.from('property_enquiries').delete().eq('id', id)
    if (error) { toast.error(errorMessage(error)); return }
    setEnquiries((cur) => cur?.filter((e) => e.id !== id) ?? null)
    toast.success('Enquiry deleted')
  }

  return (
    <div className="container max-w-4xl py-6">
      <PageHeader title="My enquiries" description="Track messages you've sent to property owners." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="new">Open ({counts.new})</TabsTrigger>
          <TabsTrigger value="responded">Responded ({counts.responded})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({counts.closed})</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-4 space-y-3">
        {enquiries === null ? <Spinner /> : shown.length === 0 ? (
          <EmptyState icon={<MessageSquare />} title="No enquiries here" description="When you contact an owner from a listing, it shows up here."
            action={<Button asChild><Link to="/search">Find a property</Link></Button>} />
        ) : shown.map((e) => {
          const l = listings.get(e.property_id)
          const img = publicUrl(BUCKETS.propertyImages, l?.cover_path)
          const b = enquiryBadge[e.status]
          return (
            <div key={e.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex gap-3">
                <Link to={`/property/${e.property_id}`} className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-5 w-5" /></div>}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/property/${e.property_id}`} className="truncate font-semibold hover:underline">{l?.title ?? 'Property no longer available'}</Link>
                    <Badge variant={b.variant}>{b.label}</Badge>
                  </div>
                  {l && <p className="text-xs text-muted-foreground">{l.configuration} · {formatINR(l.rent_amount)}/mo · {l.area}</p>}
                  <p className="text-xs text-muted-foreground">Sent {timeAgo(e.created_at)}{e.preferred_visit_date ? ` · Visit requested ${formatDate(e.preferred_visit_date)}` : ''}</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm"><span className="text-xs font-semibold text-muted-foreground">You:</span> {e.message}</div>
              {e.owner_response && (
                <div className="mt-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
                  <span className="text-xs font-semibold text-success">Owner replied {e.responded_at ? timeAgo(e.responded_at) : ''}:</span> {e.owner_response}
                </div>
              )}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {e.status !== 'closed' && (
                  <ConfirmDialog title="Close this enquiry?" description="The owner will see it as closed. You can send a new enquiry later."
                    confirmLabel="Close enquiry" onConfirm={() => close(e.id)}
                    trigger={(open) => <Button size="sm" variant="outline" onClick={open}><XCircle /> Close</Button>} />
                )}
                <ConfirmDialog title="Delete this enquiry?" description="This permanently removes the enquiry for both you and the owner." destructive
                  confirmLabel="Delete" onConfirm={() => remove(e.id)}
                  trigger={(open) => <Button size="sm" variant="ghost" className="text-destructive" onClick={open}><Trash2 /> Delete</Button>} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

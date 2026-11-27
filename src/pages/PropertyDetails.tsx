import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  BadgeCheck, Bath, CalendarDays, ChevronLeft, ChevronRight, Eye, Flag, Heart, Home, ImageOff, Layers, MapPin,
  MessageCircle, Navigation, Pencil, Phone, Ruler, Share2, Sofa, Star, Store, Users, Wallet,
} from 'lucide-react'
import { supabase, BUCKETS, publicUrl } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useSaved } from '@/hooks/useSaved'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PropertyMap } from '@/components/property/PropertyMap'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { EmptyState, Field, Spinner } from '@/components/ui/misc'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { FURNISHING, PREFERRED_TENANTS, REPORT_REASONS } from '@/lib/constants'
import { cn, errorMessage, formatDate, formatINR, initials, timeAgo, toE164 } from '@/lib/utils'
import type { Amenity, Listing, PropertyImage, PublicProfile, Review } from '@/types/db'

const enquirySchema = z.object({
  message: z.string().trim().min(5, 'Please write at least 5 characters').max(2000),
  contact_phone: z.string().trim().optional().refine((v) => !v || toE164(v) !== null, 'Enter a valid mobile number'),
  preferred_visit_date: z.string().optional().refine((v) => !v || v >= new Date().toISOString().slice(0, 10), 'Date must be today or later'),
})
type EnquiryForm = z.infer<typeof enquirySchema>

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Pick a rating').max(5),
  comment: z.string().trim().max(2000).optional(),
})
type ReviewForm = z.infer<typeof reviewSchema>

const reportSchema = z.object({
  reason: z.string().min(1, 'Choose a reason'),
  details: z.string().trim().max(3000).optional(),
})
type ReportForm = z.infer<typeof reportSchema>

function Stars({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn(size, i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />)}
    </span>
  )
}

function EnquiryCard({ listing }: { listing: Listing }) {
  const { user, profile } = useAuth()
  const location = useLocation()
  const [sent, setSent] = useState(false)
  const form = useForm<EnquiryForm>({
    resolver: zodResolver(enquirySchema),
    defaultValues: { message: `Hi, I'm interested in "${listing.title}". Is it still available?`, contact_phone: profile?.phone ?? '', preferred_visit_date: '' },
  })
  useEffect(() => { if (profile?.phone && !form.getValues('contact_phone')) form.setValue('contact_phone', profile.phone) }, [profile, form])

  if (!user) {
    return (
      <div className="space-y-2 text-center">
        <p className="text-sm text-muted-foreground">Sign in to contact the owner and send an enquiry.</p>
        <Button asChild className="w-full"><Link to={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in to contact</Link></Button>
        <Button asChild variant="outline" className="w-full"><Link to="/signup">Create free account</Link></Button>
      </div>
    )
  }
  if (sent) {
    return (
      <div className="space-y-2 rounded-lg bg-success/10 p-4 text-center text-sm">
        <p className="font-semibold text-success">Enquiry sent!</p>
        <p className="text-muted-foreground">The owner has been notified. Track replies in My Enquiries.</p>
        <Button asChild variant="outline" size="sm"><Link to="/enquiries">View my enquiries</Link></Button>
      </div>
    )
  }
  async function onSubmit(v: EnquiryForm) {
    const { error } = await supabase.from('property_enquiries').insert({
      property_id: listing.id,
      tenant_id: user!.id,
      owner_id: listing.owner_id,
      message: v.message,
      contact_phone: v.contact_phone ? toE164(v.contact_phone) : null,
      preferred_visit_date: v.preferred_visit_date || null,
    })
    if (error) {
      if (error.code === '23505') toast.error('You already have an open enquiry for this property. Check My Enquiries.')
      else toast.error(errorMessage(error))
      return
    }
    toast.success('Enquiry sent to the owner')
    setSent(true)
  }
  const { register, formState: { errors, isSubmitting } } = form
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <Field label="Message" htmlFor="enq-msg" error={errors.message?.message} required>
        <Textarea id="enq-msg" rows={4} {...register('message')} aria-invalid={!!errors.message} />
      </Field>
      <Field label="Your phone" htmlFor="enq-phone" error={errors.contact_phone?.message} hint="Shared only with this owner">
        <Input id="enq-phone" type="tel" inputMode="tel" placeholder="+91 98xxxxxxxx" {...register('contact_phone')} aria-invalid={!!errors.contact_phone} />
      </Field>
      <Field label="Preferred visit date" htmlFor="enq-date" error={errors.preferred_visit_date?.message}>
        <Input id="enq-date" type="date" min={new Date().toISOString().slice(0, 10)} {...register('preferred_visit_date')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}><MessageCircle /> Send enquiry</Button>
    </form>
  )
}

function ReviewFormBox({ propertyId, existing, onSaved }: { propertyId: string; existing?: Review; onSaved: () => void }) {
  const { user } = useAuth()
  const form = useForm<ReviewForm>({ resolver: zodResolver(reviewSchema), defaultValues: { rating: existing?.rating ?? 0, comment: existing?.comment ?? '' } })
  const rating = form.watch('rating')
  async function onSubmit(v: ReviewForm) {
    const { error } = await supabase.from('property_reviews').upsert(
      { property_id: propertyId, reviewer_id: user!.id, rating: v.rating, comment: v.comment || null },
      { onConflict: 'property_id,reviewer_id' },
    )
    if (error) {
      if (error.code === '42501') toast.error('Only people who enquired about or rented this property can review it.')
      else toast.error(errorMessage(error))
      return
    }
    toast.success(existing ? 'Review updated' : 'Thanks for your review!')
    onSaved()
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm font-medium">{existing ? 'Update your review' : 'Share your rental experience'}</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <button type="button" key={i} role="radio" aria-checked={rating === i} onClick={() => form.setValue('rating', i, { shouldValidate: true })}>
            <Star className={cn('h-7 w-7', i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
          </button>
        ))}
      </div>
      {form.formState.errors.rating && <p className="text-xs text-destructive">{form.formState.errors.rating.message}</p>}
      <Textarea rows={3} placeholder="How was the property, owner, water supply, neighbourhood…" {...form.register('comment')} />
      <Button type="submit" size="sm" loading={form.formState.isSubmitting}>{existing ? 'Update review' : 'Post review'}</Button>
    </form>
  )
}

function ReportDialog({ propertyId, ownerId }: { propertyId: string; ownerId: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const form = useForm<ReportForm>({ resolver: zodResolver(reportSchema), defaultValues: { reason: '', details: '' } })
  async function onSubmit(v: ReportForm) {
    const { error } = await supabase.from('user_reports').insert({
      reporter_id: user!.id, property_id: propertyId, reported_user_id: ownerId, reason: v.reason, details: v.details || null,
    })
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Report submitted. Our team will review it.')
    form.reset(); setOpen(false)
  }
  return (
    <>
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => (user ? setOpen(true) : toast.info('Sign in to report a listing'))}>
        <Flag /> Report listing
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this listing</DialogTitle>
            <DialogDescription>Help keep Roomly safe. Reports are reviewed by administrators.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <Field label="Reason" error={form.formState.errors.reason?.message} required>
              <NativeSelect {...form.register('reason')}>
                <option value="">Select a reason</option>
                {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Details">
              <Textarea rows={3} {...form.register('details')} placeholder="What's wrong with this listing?" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" loading={form.formState.isSubmitting}>Submit report</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function PropertyDetails() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { savedIds, toggleSaved } = useSaved()
  const location = useLocation()
  const [listing, setListing] = useState<Listing | null>(null)
  const [images, setImages] = useState<PropertyImage[]>([])
  const [amenities, setAmenities] = useState<Amenity[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewers, setReviewers] = useState<Record<string, PublicProfile>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [imgIdx, setImgIdx] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const viewed = useRef<string | null>(null)
  useDocumentTitle(listing?.title ?? 'Property')

  async function loadReviews(pid: string) {
    const { data } = await supabase.from('property_reviews').select('*').eq('property_id', pid).order('created_at', { ascending: false })
    const rs = (data ?? []) as Review[]
    setReviews(rs)
    const ids = [...new Set(rs.map((r) => r.reviewer_id))]
    if (ids.length) {
      const { data: profs } = await supabase.from('public_profiles').select('id, full_name, avatar_url, is_verified').in('id', ids)
      setReviewers(Object.fromEntries(((profs ?? []) as PublicProfile[]).map((p) => [p.id, p])))
    }
  }

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true); setNotFound(false); setImgIdx(0)
    ;(async () => {
      const { data, error } = await supabase.from('property_listings').select('*').eq('id', id).maybeSingle()
      if (!active) return
      if (error || !data) { setNotFound(true); setLoading(false); return }
      setListing(data as Listing)
      const [imgs, ams] = await Promise.all([
        supabase.from('property_images').select('*').eq('property_id', id).order('is_cover', { ascending: false }).order('sort_order'),
        supabase.from('property_amenities').select('amenity:amenities(id, slug, name, icon)').eq('property_id', id),
      ])
      if (!active) return
      setImages((imgs.data ?? []) as PropertyImage[])
      setAmenities(((ams.data ?? []) as unknown as { amenity: Amenity | null }[]).map((r) => r.amenity).filter(Boolean) as Amenity[])
      await loadReviews(id)
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (!listing || viewed.current === listing.id) return
    if (user && user.id === listing.owner_id) return
    viewed.current = listing.id
    void supabase.rpc('increment_property_view', { _property_id: listing.id })
  }, [listing, user])

  if (loading) return <Spinner label="Loading property…" />
  if (notFound || !listing) {
    return (
      <div className="container py-16">
        <EmptyState icon={<Home />} title="Property not found" description="This listing may have been removed or is no longer available."
          action={<Button asChild><Link to="/search">Browse properties</Link></Button>} />
      </div>
    )
  }

  const isOwner = user?.id === listing.owner_id
  const urls = images.map((i) => publicUrl(BUCKETS.propertyImages, i.storage_path)!)
  const current = urls[imgIdx]
  const hasGeo = listing.latitude != null && listing.longitude != null
  const phoneDigits = listing.contact_phone?.replace(/\D/g, '')
  const myReview = reviews.find((r) => r.reviewer_id === user?.id)
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
  const available = !listing.available_from || listing.available_from <= new Date().toISOString().slice(0, 10)

  async function share() {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: listing!.title, text: `${listing!.configuration} for ${formatINR(listing!.rent_amount)}/mo`, url })
      else { await navigator.clipboard.writeText(url); toast.success('Link copied to clipboard') }
    } catch { /* user cancelled */ }
  }

  const details: [typeof Home, string, string][] = [
    [Home, 'Configuration', listing.configuration],
    [Sofa, 'Furnishing', FURNISHING.find((f) => f.value === listing.furnishing)?.label ?? listing.furnishing],
    ...(listing.area_sqft ? [[Ruler, 'Area', `${listing.area_sqft} sq.ft`] as [typeof Home, string, string]] : []),
    ...(listing.bathrooms != null ? [[Bath, 'Bathrooms', String(listing.bathrooms)] as [typeof Home, string, string]] : []),
    ...(listing.floor_label ? [[Layers, 'Floor', listing.floor_label] as [typeof Home, string, string]] : []),
    [Users, 'Preferred tenants', PREFERRED_TENANTS.find((p) => p.value === listing.preferred_tenants)?.label ?? 'Anyone'],
    [CalendarDays, 'Available', available ? 'Immediately' : `From ${formatDate(listing.available_from)}`],
    [Eye, 'Views', String(listing.views_count)],
  ]

  return (
    <div className="container py-4 sm:py-6">
      <Link to="/search" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Back to search</Link>

      {/* Gallery */}
      <div className="grid gap-2 md:grid-cols-[1fr_200px]">
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
          {current ? (
            <button className="h-full w-full" onClick={() => setLightbox(true)} aria-label="Open photo viewer">
              <img src={current} alt={listing.title} className="h-full w-full object-cover" />
            </button>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground"><ImageOff className="h-10 w-10" /><span className="text-sm">No photos yet</span></div>
          )}
          {urls.length > 1 && (
            <>
              <button onClick={() => setImgIdx((i) => (i - 1 + urls.length) % urls.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow" aria-label="Previous photo"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={() => setImgIdx((i) => (i + 1) % urls.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow" aria-label="Next photo"><ChevronRight className="h-5 w-5" /></button>
              <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{imgIdx + 1} / {urls.length}</span>
            </>
          )}
        </div>
        {urls.length > 1 && (
          <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-y-auto md:max-h-[calc((100vw-2rem-200px)*0.625)] lg:max-h-[480px]">
            {urls.map((u, i) => (
              <button key={u} onClick={() => setImgIdx(i)} className={cn('aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-lg border-2 md:w-full', i === imgIdx ? 'border-primary' : 'border-transparent')}>
                <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Badge variant="secondary">{listing.configuration}</Badge>
              {listing.category_name && <Badge variant="outline">{listing.category_name}</Badge>}
              {listing.is_commercial && <Badge className="bg-violet-600 text-white"><Store className="h-3 w-3" /> Commercial</Badge>}
              {listing.is_verified && <Badge variant="success"><BadgeCheck className="h-3 w-3" /> Verified</Badge>}
              {listing.status === 'rented' && <Badge variant="destructive">Rented</Badge>}
              {listing.status === 'inactive' && <Badge variant="muted">Inactive</Badge>}
              {listing.status === 'draft' && <Badge variant="warning">Draft</Badge>}
            </div>
            <h1 className="text-2xl font-bold sm:text-3xl">{listing.title}</h1>
            <p className="mt-1 flex items-start gap-1 text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              {[listing.address_line, listing.landmark && `Near ${listing.landmark}`, listing.area, listing.island, listing.pincode].filter(Boolean).join(', ')}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => toggleSaved(listing.id)}>
                <Heart className={cn(savedIds.has(listing.id) && 'fill-destructive text-destructive')} /> {savedIds.has(listing.id) ? 'Saved' : 'Save'}
              </Button>
              <Button variant="outline" size="sm" onClick={share}><Share2 /> Share</Button>
              {isOwner && <Button asChild size="sm"><Link to={`/properties/${listing.id}/edit`}><Pencil /> Edit listing</Link></Button>}
              {!isOwner && <ReportDialog propertyId={listing.id} ownerId={listing.owner_id} />}
            </div>
          </div>

          <Card>
            <CardContent className="grid grid-cols-3 gap-4 p-5 text-center">
              <div><p className="text-xs text-muted-foreground">Monthly rent</p><p className="text-xl font-bold text-primary">{formatINR(listing.rent_amount)}</p></div>
              <div><p className="text-xs text-muted-foreground">Security deposit</p><p className="text-lg font-semibold">{formatINR(listing.security_deposit)}</p></div>
              <div><p className="text-xs text-muted-foreground">Maintenance</p><p className="text-lg font-semibold">{listing.maintenance_fee ? formatINR(listing.maintenance_fee) : 'Included'}</p></div>
            </CardContent>
          </Card>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Property details</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {details.map(([Icon, label, value]) => (
                <div key={label} className="rounded-lg border bg-card p-3">
                  <Icon className="mb-1 h-4 w-4 text-primary" />
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium capitalize">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {listing.description && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">About this property</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{listing.description}</p>
            </section>
          )}

          {amenities.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Amenities</h2>
              <div className="flex flex-wrap gap-2">
                {amenities.map((a) => <span key={a.id} className="rounded-full border bg-card px-3 py-1 text-sm">{a.name}</span>)}
              </div>
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Location</h2>
              {hasGeo && (
                <a className="flex items-center gap-1 text-sm font-medium text-primary hover:underline" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${listing.latitude},${listing.longitude}`}>
                  <Navigation className="h-4 w-4" /> Directions
                </a>
              )}
            </div>
            {hasGeo ? (
              <div className="h-64 overflow-hidden rounded-xl border">
                <PropertyMap listings={[listing]} center={[listing.latitude!, listing.longitude!]} zoom={15} />
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">The owner hasn't added GPS coordinates for this property.</p>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-lg font-semibold">Reviews</h2>
              {reviews.length > 0 && <span className="flex items-center gap-1 text-sm text-muted-foreground"><Stars value={avg} /> {avg.toFixed(1)} · {reviews.length}</span>}
            </div>
            {user && !isOwner && <div className="mb-4"><ReviewFormBox key={myReview?.id ?? 'new'} propertyId={listing.id} existing={myReview} onSaved={() => loadReviews(listing.id)} /></div>}
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reviews yet.</p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => {
                  const p = reviewers[r.reviewer_id]
                  return (
                    <li key={r.id} className="rounded-lg border bg-card p-4">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {p?.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(p?.full_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{p?.full_name || 'Roomly user'}</p>
                          <p className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</p>
                        </div>
                        {r.is_verified_tenant && <Badge variant="success"><BadgeCheck className="h-3 w-3" /> Verified tenant</Badge>}
                      </div>
                      <div className="mt-2"><Stars value={r.rating} /></div>
                      {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Contact owner</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isOwner ? (
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">This is your listing.</p>
                  <Button asChild className="w-full"><Link to="/dashboard/owner"><Wallet /> Manage in owner dashboard</Link></Button>
                </div>
              ) : user ? (
                <div className="space-y-2">
                  {listing.contact_name && <p className="font-medium">{listing.contact_name}</p>}
                  {phoneDigits ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button asChild variant="outline"><a href={`tel:${listing.contact_phone}`}><Phone /> Call</a></Button>
                      <Button asChild variant="outline" className="text-success">
                        <a href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hi, I saw your listing "${listing.title}" on Roomly.`)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">The owner prefers to be contacted via enquiry.</p>
                  )}
                  {listing.contact_phone && <p className="text-center font-mono text-sm text-muted-foreground">{listing.contact_phone}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="font-medium text-primary hover:underline">Sign in</Link> to see the owner's phone number.
                </p>
              )}
              {!isOwner && listing.status === 'active' && <div className="border-t pt-4"><EnquiryCard listing={listing} /></div>}
              {!isOwner && listing.status !== 'active' && (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">This property isn't accepting enquiries right now.</p>
              )}
            </CardContent>
          </Card>
          <p className="px-1 text-xs text-muted-foreground">Safety tip: always visit the property before paying any advance or deposit. Never share OTPs.</p>
        </aside>
      </div>

      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-4xl bg-black p-2 sm:max-w-4xl">
          <DialogTitle className="sr-only">Photo {imgIdx + 1}</DialogTitle>
          {current && <img src={current} alt="" className="max-h-[80vh] w-full object-contain" />}
          {urls.length > 1 && (
            <div className="flex justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setImgIdx((i) => (i - 1 + urls.length) % urls.length)}><ChevronLeft /> Prev</Button>
              <Button variant="secondary" size="sm" onClick={() => setImgIdx((i) => (i + 1) % urls.length)}>Next <ChevronRight /></Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

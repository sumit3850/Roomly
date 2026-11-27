import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Crosshair, ImagePlus, Loader2, Star, Trash2, ArrowLeft, ArrowRight } from 'lucide-react'
import { supabase, BUCKETS, publicUrl } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useReferenceData } from '@/hooks/useReferenceData'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/misc'
import { LocationPicker } from '@/components/property/PropertyMap'
import { CONFIGURATIONS, FURNISHING, ISLANDS, MAX_IMAGES, POPULAR_AREAS, PREFERRED_TENANTS } from '@/lib/constants'
import { uploadPropertyImage, validateImage } from '@/lib/storage'
import { cn, errorMessage, toE164 } from '@/lib/utils'
import type { Property, PropertyImage, PropertyLocation } from '@/types/db'

const optNum = (min: number, max: number, label: string, int = false) =>
  z.string().trim().refine((v) => {
    if (v === '') return true
    const n = Number(v)
    return Number.isFinite(n) && n >= min && n <= max && (!int || Number.isInteger(n))
  }, `${label} must be ${int ? 'a whole number ' : ''}between ${min} and ${max.toLocaleString('en-IN')}`)

const schema = z.object({
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(140),
  category_id: z.string().min(1, 'Choose a category'),
  configuration: z.enum(CONFIGURATIONS),
  furnishing: z.enum(['unfurnished', 'semi-furnished', 'fully-furnished']),
  description: z.string().trim().max(5000).optional().default(''),
  rent_amount: z.string().trim().min(1, 'Rent is required').pipe(optNum(0, 100000000, 'Rent')),
  security_deposit: optNum(0, 100000000, 'Deposit'),
  maintenance_fee: optNum(0, 10000000, 'Maintenance'),
  area_sqft: optNum(1, 1000000, 'Area', true),
  bathrooms: optNum(0, 50, 'Bathrooms', true),
  floor_label: z.string().trim().max(40),
  available_from: z.string(),
  preferred_tenants: z.string(),
  island: z.string().min(1),
  area: z.string().trim().min(2, 'Area / locality is required').max(120),
  address_line: z.string().trim().max(250),
  landmark: z.string().trim().max(160),
  pincode: z.string().trim().refine((v) => v === '' || /^7441\d{2}$/.test(v), 'A&N pincodes look like 7441xx'),
  latitude: z.string().trim(),
  longitude: z.string().trim(),
  contact_name: z.string().trim().max(120),
  contact_phone: z.string().trim().refine((v) => v === '' || toE164(v) !== null, 'Enter a valid mobile number'),
  status: z.enum(['draft', 'active']),
}).superRefine((v, ctx) => {
  const hasLat = v.latitude !== '', hasLng = v.longitude !== ''
  if (hasLat !== hasLng) ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Provide both latitude and longitude' })
  if (hasLat) {
    const lat = Number(v.latitude)
    if (!Number.isFinite(lat) || lat < 6 || lat > 14.5) ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Latitude must be within the A&N Islands (6–14.5)' })
  }
  if (hasLng) {
    const lng = Number(v.longitude)
    if (!Number.isFinite(lng) || lng < 92 || lng > 94.5) ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Longitude must be within the A&N Islands (92–94.5)' })
  }
})

type FormValues = z.input<typeof schema>

export interface PropertyFormInitial {
  property: Property
  location: PropertyLocation | null
  amenityIds: string[]
  images: PropertyImage[]
}

export interface AdPrefill { title?: string; area?: string; configuration?: string; rent?: number | null; phone?: string | null; is_commercial?: boolean }

interface NewImage { key: string; file: File; url: string }

export function PropertyForm({ initial, prefill }: { initial?: PropertyFormInitial; prefill?: AdPrefill }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { categories, amenities } = useReferenceData()
  const p = initial?.property
  const l = initial?.location

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: p?.title ?? prefill?.title ?? '',
      category_id: p?.category_id ?? '',
      configuration: (p?.configuration
        ?? ((CONFIGURATIONS as readonly string[]).includes(prefill?.configuration ?? '') ? prefill!.configuration : '2 BHK')) as FormValues['configuration'],
      furnishing: p?.furnishing ?? 'unfurnished',
      description: p?.description ?? '',
      rent_amount: p ? String(p.rent_amount) : prefill?.rent ? String(prefill.rent) : '',
      security_deposit: p ? String(p.security_deposit ?? '') : '',
      maintenance_fee: p ? String(p.maintenance_fee ?? '') : '',
      area_sqft: p?.area_sqft != null ? String(p.area_sqft) : '',
      bathrooms: p?.bathrooms != null ? String(p.bathrooms) : '',
      floor_label: p?.floor_label ?? '',
      available_from: p?.available_from ?? '',
      preferred_tenants: p?.preferred_tenants ?? 'any',
      island: l?.island ?? 'South Andaman',
      area: l?.area ?? prefill?.area ?? '',
      address_line: l?.address_line ?? '',
      landmark: l?.landmark ?? '',
      pincode: l?.pincode ?? '',
      latitude: l?.latitude != null ? String(l.latitude) : '',
      longitude: l?.longitude != null ? String(l.longitude) : '',
      contact_name: p?.contact_name ?? profile?.full_name ?? '',
      contact_phone: p?.contact_phone ?? prefill?.phone ?? profile?.phone ?? '',
      status: p?.status === 'draft' ? 'draft' : 'active',
    },
  })
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = form

  // Fill contact defaults once the profile arrives (add flow)
  useEffect(() => {
    if (p || !profile) return
    if (!form.getValues('contact_name')) setValue('contact_name', profile.full_name ?? '')
    if (!form.getValues('contact_phone') && profile.phone) setValue('contact_phone', profile.phone)
  }, [profile, p, form, setValue])

  // Prefill category for commercial adverts once categories load
  useEffect(() => {
    if (p || !prefill?.is_commercial || !categories.length || form.getValues('category_id')) return
    const c = categories.find((x) => x.slug === 'office') ?? categories.find((x) => x.is_commercial)
    if (c) setValue('category_id', c.id)
  }, [categories, prefill, p, form, setValue])

  const [amenitySet, setAmenitySet] = useState<Set<string>>(new Set(initial?.amenityIds ?? []))
  const [existing, setExisting] = useState<PropertyImage[]>(
    [...(initial?.images ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  )
  const [newImages, setNewImages] = useState<NewImage[]>([])
  const [cover, setCover] = useState<string | null>(() => {
    const c = initial?.images.find((i) => i.is_cover) ?? initial?.images[0]
    return c ? `e:${c.id}` : null
  })
  const [progress, setProgress] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [locating, setLocating] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => newImages.forEach((n) => URL.revokeObjectURL(n.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const lat = watch('latitude'), lng = watch('longitude'), categoryId = watch('category_id')
  const coords = useMemo(() => {
    const a = Number(lat), b = Number(lng)
    return lat !== '' && lng !== '' && Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null
  }, [lat, lng])
  const selectedCategory = categories.find((c) => c.id === categoryId)
  const totalImages = existing.length + newImages.length

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files)
    const room = MAX_IMAGES - totalImages
    if (room <= 0) { toast.error(`Maximum ${MAX_IMAGES} photos`); return }
    const accepted: NewImage[] = []
    for (const f of list.slice(0, room)) {
      const err = validateImage(f)
      if (err) { toast.error(err); continue }
      accepted.push({ key: crypto.randomUUID(), file: f, url: URL.createObjectURL(f) })
    }
    if (list.length > room) toast.warning(`Only ${room} more photo(s) allowed`)
    if (accepted.length) {
      setNewImages((prev) => [...prev, ...accepted])
      if (!cover) setCover(`n:${accepted[0].key}`)
    }
  }

  async function removeExisting(img: PropertyImage) {
    const { error: sErr } = await supabase.storage.from(BUCKETS.propertyImages).remove([img.storage_path])
    if (sErr) { toast.error(errorMessage(sErr)); return }
    const { error } = await supabase.from('property_images').delete().eq('id', img.id)
    if (error) { toast.error(errorMessage(error)); return }
    setExisting((prev) => prev.filter((i) => i.id !== img.id))
    if (cover === `e:${img.id}`) setCover(null)
    toast.success('Photo removed')
  }

  function removeNew(n: NewImage) {
    URL.revokeObjectURL(n.url)
    setNewImages((prev) => prev.filter((x) => x.key !== n.key))
    if (cover === `n:${n.key}`) setCover(null)
  }

  function moveExisting(idx: number, dir: -1 | 1) {
    setExisting((prev) => {
      const j = idx + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  function useMyLocation() {
    if (!navigator.geolocation) { toast.error('Geolocation is not supported on this device'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const { latitude, longitude } = pos.coords
        if (latitude < 6 || latitude > 14.5 || longitude < 92 || longitude > 94.5) {
          toast.error('Your current location is outside the Andaman & Nicobar Islands. Place the pin on the map instead.')
          return
        }
        setValue('latitude', latitude.toFixed(6), { shouldValidate: true })
        setValue('longitude', longitude.toFixed(6), { shouldValidate: true })
        toast.success('Location captured')
      },
      (err) => { setLocating(false); toast.error(err.message || 'Could not get your location') },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function onSubmit(raw: FormValues) {
    if (!user) return
    const v = schema.parse(raw)
    const n = (s: string) => (s === '' ? null : Number(s))
    const payload = {
      title: v.title,
      category_id: v.category_id || null,
      configuration: v.configuration,
      is_commercial: selectedCategory?.is_commercial ?? false,
      furnishing: v.furnishing,
      description: v.description || null,
      rent_amount: Number(v.rent_amount),
      security_deposit: n(v.security_deposit) ?? 0,
      maintenance_fee: n(v.maintenance_fee) ?? 0,
      area_sqft: n(v.area_sqft),
      bathrooms: n(v.bathrooms),
      floor_label: v.floor_label || null,
      available_from: v.available_from || null,
      preferred_tenants: v.preferred_tenants,
      contact_name: v.contact_name || null,
      contact_phone: v.contact_phone ? toE164(v.contact_phone) : null,
      // keep rented/inactive status on edit unless the owner explicitly toggles draft/active
      ...(p && (p.status === 'rented' || p.status === 'inactive') ? {} : { status: v.status }),
    }

    let propertyId = p?.id
    try {
      setProgress('Saving listing…')
      if (propertyId) {
        const { error } = await supabase.from('properties').update(payload).eq('id', propertyId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('properties').insert({ ...payload, owner_id: user.id }).select('id').single()
        if (error) throw error
        propertyId = data.id as string
      }

      setProgress('Saving location…')
      const { error: locErr } = await supabase.from('property_locations').upsert({
        property_id: propertyId,
        island: v.island,
        area: v.area,
        address_line: v.address_line || null,
        landmark: v.landmark || null,
        pincode: v.pincode || null,
        latitude: n(v.latitude),
        longitude: n(v.longitude),
      }, { onConflict: 'property_id' })
      if (locErr) throw locErr

      setProgress('Saving amenities…')
      const { error: delErr } = await supabase.from('property_amenities').delete().eq('property_id', propertyId)
      if (delErr) throw delErr
      if (amenitySet.size) {
        const { error } = await supabase.from('property_amenities').insert([...amenitySet].map((amenity_id) => ({ property_id: propertyId, amenity_id })))
        if (error) throw error
      }

      // Re-order / re-cover existing images
      for (let i = 0; i < existing.length; i++) {
        const img = existing[i]
        const isCover = cover === `e:${img.id}`
        if (img.sort_order !== i || img.is_cover !== isCover) {
          const { error } = await supabase.from('property_images').update({ sort_order: i, is_cover: isCover }).eq('id', img.id)
          if (error) throw error
        }
      }

      const failed: string[] = []
      for (let i = 0; i < newImages.length; i++) {
        const ni = newImages[i]
        setProgress(`Uploading photo ${i + 1} of ${newImages.length}…`)
        try {
          const path = await uploadPropertyImage(user.id, propertyId!, ni.file)
          const { error } = await supabase.from('property_images').insert({
            property_id: propertyId, storage_path: path, sort_order: existing.length + i,
            is_cover: cover === `n:${ni.key}` || (!cover && existing.length === 0 && i === 0),
          })
          if (error) throw error
        } catch (e) {
          failed.push(`${ni.file.name}: ${errorMessage(e)}`)
        }
      }
      if (failed.length) toast.error(`Some photos failed to upload`, { description: failed.join('\n') })

      toast.success(p ? 'Listing updated' : v.status === 'draft' ? 'Draft saved' : 'Listing published')
      navigate(`/property/${propertyId}`)
    } catch (e) {
      const err = e as { code?: string }
      if (err.code === '23505') {
        toast.error('You already have a live listing with this title. Use a different title or edit the existing one.')
        form.setError('title', { message: 'Duplicate of one of your live listings' })
      } else {
        toast.error(errorMessage(e))
      }
      // An insert succeeded but a later step failed → switch to edit mode so the user can retry without duplicates
      if (!p && propertyId) navigate(`/properties/${propertyId}/edit`, { replace: true })
    } finally {
      setProgress(null)
    }
  }

  const busy = isSubmitting || progress !== null

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card>
        <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="title" error={errors.title?.message} required className="sm:col-span-2">
            <Input id="title" placeholder="e.g. Spacious 2 BHK near Dollygunj Post Office" aria-invalid={!!errors.title} {...register('title')} />
          </Field>
          <Field label="Category" htmlFor="category_id" error={errors.category_id?.message} required>
            <NativeSelect id="category_id" aria-invalid={!!errors.category_id} {...register('category_id')}>
              <option value="">Select…</option>
              <optgroup label="Residential">
                {categories.filter((c) => !c.is_commercial).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
              <optgroup label="Commercial">
                {categories.filter((c) => c.is_commercial).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            </NativeSelect>
          </Field>
          <Field label="Configuration" htmlFor="configuration" error={errors.configuration?.message} required>
            <NativeSelect id="configuration" {...register('configuration')}>
              {CONFIGURATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Furnishing" htmlFor="furnishing">
            <NativeSelect id="furnishing" {...register('furnishing')}>
              {FURNISHING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </NativeSelect>
          </Field>
          {selectedCategory?.is_commercial && (
            <p className="self-end text-sm text-violet-700">This will be listed as a commercial space.</p>
          )}
          <Field label="Description" htmlFor="description" error={errors.description?.message} className="sm:col-span-2">
            <Textarea id="description" rows={5} placeholder="Floor, water supply, road access, nearby schools/markets…" {...register('description')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Monthly rent (₹)" htmlFor="rent_amount" error={errors.rent_amount?.message} required>
            <Input id="rent_amount" inputMode="numeric" placeholder="12000" aria-invalid={!!errors.rent_amount} {...register('rent_amount')} />
          </Field>
          <Field label="Security deposit (₹)" htmlFor="security_deposit" error={errors.security_deposit?.message}>
            <Input id="security_deposit" inputMode="numeric" placeholder="24000" {...register('security_deposit')} />
          </Field>
          <Field label="Maintenance (₹/mo)" htmlFor="maintenance_fee" error={errors.maintenance_fee?.message}>
            <Input id="maintenance_fee" inputMode="numeric" placeholder="0" {...register('maintenance_fee')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Details &amp; availability</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Area (sq.ft)" htmlFor="area_sqft" error={errors.area_sqft?.message}>
            <Input id="area_sqft" inputMode="numeric" {...register('area_sqft')} />
          </Field>
          <Field label="Bathrooms" htmlFor="bathrooms" error={errors.bathrooms?.message}>
            <Input id="bathrooms" inputMode="numeric" {...register('bathrooms')} />
          </Field>
          <Field label="Floor" htmlFor="floor_label" error={errors.floor_label?.message}>
            <Input id="floor_label" placeholder="Ground / 2nd floor" {...register('floor_label')} />
          </Field>
          <Field label="Available from" htmlFor="available_from">
            <Input id="available_from" type="date" {...register('available_from')} />
          </Field>
          <Field label="Preferred tenants" htmlFor="preferred_tenants">
            <NativeSelect id="preferred_tenants" {...register('preferred_tenants')}>
              {PREFERRED_TENANTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
          <CardDescription>Tap the map to drop a pin (drag to adjust), or use your phone's GPS while at the property.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Island" htmlFor="island">
            <NativeSelect id="island" {...register('island')}>
              {ISLANDS.map((i) => <option key={i} value={i}>{i}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Area / locality" htmlFor="area" error={errors.area?.message} required>
            <Input id="area" list="area-options" placeholder="e.g. Dollygunj" aria-invalid={!!errors.area} {...register('area')} />
            <datalist id="area-options">{POPULAR_AREAS.map((a) => <option key={a} value={a} />)}</datalist>
          </Field>
          <Field label="Address" htmlFor="address_line" error={errors.address_line?.message}>
            <Input id="address_line" placeholder="House no., street" {...register('address_line')} />
          </Field>
          <Field label="Landmark" htmlFor="landmark" error={errors.landmark?.message}>
            <Input id="landmark" placeholder="Near Post Office" {...register('landmark')} />
          </Field>
          <Field label="Pincode" htmlFor="pincode" error={errors.pincode?.message}>
            <Input id="pincode" inputMode="numeric" maxLength={6} placeholder="744103" {...register('pincode')} />
          </Field>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={useMyLocation} loading={locating} className="w-full">
              {!locating && <Crosshair />} Use my current location
            </Button>
          </div>
          <div className="sm:col-span-2">
            <LocationPicker
              value={coords}
              onChange={({ lat: a, lng: b }) => {
                setValue('latitude', String(a), { shouldValidate: true })
                setValue('longitude', String(b), { shouldValidate: true })
              }}
              className="h-72 w-full overflow-hidden rounded-lg border"
            />
          </div>
          <Field label="Latitude" htmlFor="latitude" error={errors.latitude?.message}>
            <Input id="latitude" inputMode="decimal" placeholder="11.6234" {...register('latitude')} />
          </Field>
          <Field label="Longitude" htmlFor="longitude" error={errors.longitude?.message}>
            <div className="flex gap-2">
              <Input id="longitude" inputMode="decimal" placeholder="92.7265" {...register('longitude')} />
              {coords && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setValue('latitude', ''); setValue('longitude', '') }}>Clear</Button>
              )}
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Amenities</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {amenities.map((a) => {
              const on = amenitySet.has(a.id)
              return (
                <button
                  type="button"
                  key={a.id}
                  aria-pressed={on}
                  onClick={() => setAmenitySet((prev) => { const s = new Set(prev); on ? s.delete(a.id) : s.add(a.id); return s })}
                  className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent')}
                >
                  {a.name}
                </button>
              )
            })}
            {!amenities.length && <p className="text-sm text-muted-foreground">Loading amenities…</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
          <CardDescription>Up to {MAX_IMAGES} JPG/PNG/WebP photos, 5 MB each. Tap the star to choose the cover photo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click() }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
            className={cn('flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors', dragging ? 'border-primary bg-accent' : 'hover:bg-accent/50')}
          >
            <ImagePlus className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium">Tap to add photos or drag them here</p>
            <p className="text-xs text-muted-foreground">{totalImages}/{MAX_IMAGES} added</p>
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple capture={undefined} className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
          {totalImages > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {existing.map((img, idx) => (
                <Thumb key={img.id} src={publicUrl(BUCKETS.propertyImages, img.storage_path)!} isCover={cover === `e:${img.id}`}
                  onCover={() => setCover(`e:${img.id}`)} onRemove={() => void removeExisting(img)}
                  onLeft={idx > 0 ? () => moveExisting(idx, -1) : undefined}
                  onRight={idx < existing.length - 1 ? () => moveExisting(idx, 1) : undefined} />
              ))}
              {newImages.map((ni) => (
                <Thumb key={ni.key} src={ni.url} isCover={cover === `n:${ni.key}`} pending
                  onCover={() => setCover(`n:${ni.key}`)} onRemove={() => removeNew(ni)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contact &amp; publishing</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="contact_name" error={errors.contact_name?.message}>
            <Input id="contact_name" {...register('contact_name')} />
          </Field>
          <Field label="Contact phone" htmlFor="contact_phone" error={errors.contact_phone?.message} hint="Shown to signed-in users. 10-digit numbers get +91.">
            <Input id="contact_phone" type="tel" placeholder="+91 99332 xxxxx" aria-invalid={!!errors.contact_phone} {...register('contact_phone')} />
          </Field>
          {p && (p.status === 'rented' || p.status === 'inactive') ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              This listing is currently <strong>{p.status}</strong>. Change that from your Owner Dashboard.
            </p>
          ) : (
            <Field label="Status" htmlFor="status" className="sm:col-span-2">
              <NativeSelect id="status" {...register('status')}>
                <option value="active">Publish now (visible to everyone)</option>
                <option value="draft">Save as draft (only you can see it)</option>
              </NativeSelect>
            </Field>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-16 z-10 flex flex-col gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between md:bottom-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">{progress ?? (p ? 'Changes are saved directly to your listing.' : 'Review your details before publishing.')}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>{p ? 'Save changes' : 'Publish listing'}</Button>
        </div>
      </div>
    </form>
  )
}

function Thumb({ src, isCover, pending, onCover, onRemove, onLeft, onRight }: {
  src: string; isCover: boolean; pending?: boolean; onCover: () => void; onRemove: () => void; onLeft?: () => void; onRight?: () => void
}) {
  const [removing, setRemoving] = useState(false)
  return (
    <div className={cn('group relative aspect-square overflow-hidden rounded-lg border bg-muted', isCover && 'ring-2 ring-primary')}>
      <img src={src} alt="" className="h-full w-full object-cover" />
      {pending && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">New</span>}
      {isCover && <span className="absolute bottom-1 right-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span>}
      <div className="absolute inset-x-1 top-1 flex justify-between">
        <button type="button" onClick={onCover} aria-label="Set as cover" className="flex h-7 w-7 items-center justify-center rounded-full bg-background/90 shadow">
          <Star className={cn('h-4 w-4', isCover ? 'fill-amber-400 text-amber-400' : '')} />
        </button>
        <button type="button" aria-label="Remove photo" disabled={removing}
          onClick={async () => { setRemoving(true); try { await onRemove() } finally { setRemoving(false) } }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-destructive shadow">
          {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
      {(onLeft || onRight) && (
        <div className="absolute inset-x-1 bottom-7 flex justify-between opacity-0 transition-opacity group-hover:opacity-100">
          {onLeft ? <button type="button" onClick={onLeft} aria-label="Move left" className="rounded-full bg-background/90 p-1 shadow"><ArrowLeft className="h-3.5 w-3.5" /></button> : <span />}
          {onRight ? <button type="button" onClick={onRight} aria-label="Move right" className="rounded-full bg-background/90 p-1 shadow"><ArrowRight className="h-3.5 w-3.5" /></button> : <span />}
        </div>
      )}
    </div>
  )
}

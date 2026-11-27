import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { LatLngBounds } from 'leaflet'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, List, LocateFixed, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSaved } from '@/hooks/useSaved'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PropertyMap } from '@/components/property/PropertyMap'
import { PropertyCard } from '@/components/property/PropertyCard'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { CONFIGURATIONS } from '@/lib/constants'
import { cn, errorMessage } from '@/lib/utils'
import type { Listing } from '@/types/db'

export default function MapSearch() {
  useDocumentTitle('Map search')
  const [params, setParams] = useSearchParams()
  const { savedIds, toggleSaved } = useSaved()
  const [bounds, setBounds] = useState<LatLngBounds | null>(null)
  const [rows, setRows] = useState<Listing[]>([])
  const [loading, setLoading] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const config = params.get('config') ?? ''
  const max = params.get('max') ?? ''
  const type = params.get('type') ?? ''

  const set = (k: string, v: string) => setParams((prev) => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })

  useEffect(() => {
    if (!bounds) return
    let active = true
    const t = setTimeout(async () => {
      setLoading(true)
      let q = supabase.from('property_listings').select('*').eq('status', 'active')
        .gte('latitude', bounds.getSouth()).lte('latitude', bounds.getNorth())
        .gte('longitude', bounds.getWest()).lte('longitude', bounds.getEast())
      if (config) q = q.eq('configuration', config)
      if (max && !isNaN(Number(max))) q = q.lte('rent_amount', Number(max))
      if (type === 'commercial') q = q.eq('is_commercial', true)
      if (type === 'residential') q = q.eq('is_commercial', false)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(300)
      if (!active) return
      if (error) toast.error(errorMessage(error))
      setRows((data ?? []) as Listing[])
      setLoading(false)
    }, 400)
    return () => { active = false; clearTimeout(t) }
  }, [bounds, config, max, type])

  const onBounds = useCallback((b: LatLngBounds) => setBounds(b), [])

  function nearMe() {
    if (!navigator.geolocation) { toast.error('Your browser does not support location.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setUserLoc(ll); setCenter(ll); setLocating(false)
      },
      (err) => {
        setLocating(false)
        toast.error(err.code === err.PERMISSION_DENIED ? 'Location permission denied. Enable it in your browser settings.' : 'Could not get your location. Try again.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  function selectMarker(id: string) {
    setActiveId(id)
    setSheetOpen(true)
    setTimeout(() => cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  const list = (
    <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {rows.length === 0 && !loading && (
        <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No properties with map locations here. Zoom out or move the map.</p>
      )}
      {rows.map((l) => (
        <div key={l.id} ref={(el) => { cardRefs.current[l.id] = el }} onMouseEnter={() => setActiveId(l.id)}
          className={cn('rounded-xl transition', activeId === l.id && 'ring-2 ring-destructive ring-offset-2')}>
          <PropertyCard listing={l} compact saved={savedIds.has(l.id)} onToggleSave={toggleSaved} />
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4rem)] flex-col md:h-[calc(100dvh-3.5rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
        <NativeSelect value={config} onChange={(e) => set('config', e.target.value)} className="h-9 w-32" aria-label="Configuration">
          <option value="">Any type</option>
          {CONFIGURATIONS.map((c) => <option key={c}>{c}</option>)}
        </NativeSelect>
        <NativeSelect value={max} onChange={(e) => set('max', e.target.value)} className="h-9 w-36" aria-label="Max rent">
          <option value="">Any budget</option>
          {[5000, 8000, 10000, 15000, 20000, 30000, 50000, 100000].map((v) => <option key={v} value={v}>≤ ₹{v.toLocaleString('en-IN')}</option>)}
        </NativeSelect>
        <NativeSelect value={type} onChange={(e) => set('type', e.target.value)} className="h-9 w-36" aria-label="Property type">
          <option value="">Homes &amp; commercial</option>
          <option value="residential">Homes only</option>
          <option value="commercial">Commercial only</option>
        </NativeSelect>
        <Button size="sm" variant="outline" onClick={nearMe} disabled={locating}>
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} Near me
        </Button>
        <span className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {rows.length} {rows.length === 1 ? 'property' : 'properties'} in this area
        </span>
        <Button asChild size="sm" variant="ghost" className="hidden md:inline-flex"><Link to={`/search?${params.toString()}`}><List /> List view</Link></Button>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1">
          <PropertyMap listings={rows} onBoundsChange={onBounds} activeId={activeId} onMarkerClick={selectMarker} center={center} userLocation={userLoc} />
        </div>
        <aside className="hidden w-[420px] overflow-y-auto border-l bg-muted/30 lg:block xl:w-[560px]">{list}</aside>
        {/* mobile / tablet bottom sheet */}
        <div className={cn('absolute inset-x-0 bottom-0 z-[500] flex flex-col rounded-t-2xl border-t bg-background shadow-2xl transition-[height] lg:hidden', sheetOpen ? 'h-[60%]' : 'h-12')}>
          <button onClick={() => setSheetOpen((o) => !o)} className="flex h-12 shrink-0 items-center justify-center gap-2 text-sm font-medium">
            {sheetOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            {sheetOpen ? 'Hide list' : `Show ${rows.length} properties`}
          </button>
          {sheetOpen && <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>}
        </div>
      </div>
    </div>
  )
}

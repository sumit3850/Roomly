import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Map, MapPin, Newspaper, Search, ShieldCheck, Store } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { InstallAppButton } from '@/components/layout/InstallApp'
import { ToLetButton } from '@/components/layout/ToLetButton'
import { useAuth } from '@/contexts/AuthContext'
import { useSaved } from '@/hooks/useSaved'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/misc'
import { PropertyCard, PropertyCardSkeleton } from '@/components/property/PropertyCard'
import { CONFIGURATIONS, POPULAR_AREAS } from '@/lib/constants'
import type { Listing } from '@/types/db'

export default function Home() {
  useDocumentTitle('')
  const navigate = useNavigate()
  const { user, isOwner } = useAuth()
  const { savedIds, toggleSaved } = useSaved()
  const [q, setQ] = useState('')
  const [config, setConfig] = useState('')
  const [max, setMax] = useState('')
  const [latest, setLatest] = useState<Listing[] | null>(null)
  const [commercial, setCommercial] = useState<Listing[] | null>(null)
  const [counts, setCounts] = useState<{ active: number; commercial: number; ads: number } | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('property_listings').select('*').eq('status', 'active').order('is_featured', { ascending: false }).order('created_at', { ascending: false }).limit(8),
      supabase.from('property_listings').select('*').eq('status', 'active').eq('is_commercial', true).order('created_at', { ascending: false }).limit(4),
      supabase.from('properties').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('properties').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('is_commercial', true),
      supabase.from('newspaper_advertisements').select('id', { count: 'exact', head: true }),
    ]).then(([l, c, a, ac, ads]) => {
      if (!active) return
      setLatest((l.data ?? []) as Listing[])
      setCommercial((c.data ?? []) as Listing[])
      setCounts({ active: a.count ?? 0, commercial: ac.count ?? 0, ads: ads.count ?? 0 })
    })
    return () => { active = false }
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (config) p.set('config', config)
    if (max) p.set('max', max)
    navigate(`/search?${p.toString()}`)
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-cyan-700 text-primary-foreground">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="container relative py-12 sm:py-20">
          <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium"><MapPin className="h-3.5 w-3.5" /> Andaman &amp; Nicobar Islands</p>
          <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">Find your next home in the islands</h1>
          <p className="mt-3 max-w-xl text-white/85">Flats, rooms, houses and commercial spaces from verified owners across Port Blair, Havelock, Neil and beyond.</p>
          <ToLetButton className="mt-5 max-w-3xl" />
          <form onSubmit={submit} className="mt-4 grid max-w-3xl gap-2 rounded-xl bg-background p-2 text-foreground shadow-lg sm:grid-cols-[1fr_150px_150px_auto]">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Area, landmark or island (e.g. Dollygunj)" aria-label="Location" className="border-0 shadow-none focus-visible:ring-1" />
            <NativeSelect value={config} onChange={(e) => setConfig(e.target.value)} aria-label="Configuration" className="border-0 shadow-none">
              <option value="">Any type</option>
              {CONFIGURATIONS.map((c) => <option key={c}>{c}</option>)}
            </NativeSelect>
            <NativeSelect value={max} onChange={(e) => setMax(e.target.value)} aria-label="Max budget" className="border-0 shadow-none">
              <option value="">Any budget</option>
              {[5000, 8000, 10000, 15000, 20000, 30000, 50000].map((v) => <option key={v} value={v}>Up to ₹{v.toLocaleString('en-IN')}</option>)}
            </NativeSelect>
            <Button type="submit"><Search /> Search</Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {POPULAR_AREAS.slice(0, 8).map((a) => (
              <Link key={a} to={`/search?q=${encodeURIComponent(a)}`} className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25">{a}</Link>
            ))}
          </div>
          {counts && (
            <div className="mt-8 flex flex-wrap gap-6 text-sm">
              <div><span className="block text-2xl font-bold">{counts.active}</span>active listings</div>
              <div><span className="block text-2xl font-bold">{counts.commercial}</span>commercial spaces</div>
              <div><span className="block text-2xl font-bold">{counts.ads}</span>archived newspaper ads</div>
            </div>
          )}
        </div>
      </section>

      <section className="container pt-6">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="h-11 w-11 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Get the Roomly app</p>
            <p className="text-sm text-muted-foreground">Install it on your phone's home screen. Free, opens like an app.</p>
          </div>
          <InstallAppButton />
        </div>
      </section>

      <section className="container py-8">
        <h2 className="mb-3 text-lg font-semibold">Browse by type</h2>
        <div className="flex flex-wrap gap-2">
          {CONFIGURATIONS.filter((c) => c !== 'Other').map((c) => (
            <Button key={c} asChild variant="outline" size="sm"><Link to={`/search?config=${encodeURIComponent(c)}`}>{c}</Link></Button>
          ))}
          <Button asChild variant="outline" size="sm"><Link to="/search?type=commercial"><Store /> Commercial</Link></Button>
        </div>
      </section>

      <section className="container pb-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-bold">Latest listings</h2>
          <Link to="/search" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">View all <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {latest === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <PropertyCardSkeleton key={i} />)}</div>
        ) : latest.length === 0 ? (
          <EmptyState icon={<Building2 />} title="No listings yet" description="Be the first to list a property on Roomly." action={<Button asChild><Link to={user ? '/properties/new' : '/signup'}>List a property</Link></Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {latest.map((l) => <PropertyCard key={l.id} listing={l} saved={savedIds.has(l.id)} onToggleSave={toggleSaved} />)}
          </div>
        )}
      </section>

      {commercial && commercial.length > 0 && (
        <section className="bg-muted/50 py-10">
          <div className="container">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold"><Store className="h-5 w-5 text-violet-600" /> Commercial spaces</h2>
              <Link to="/search?type=commercial" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">View all <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {commercial.map((l) => <PropertyCard key={l.id} listing={l} compact saved={savedIds.has(l.id)} onToggleSave={toggleSaved} />)}
            </div>
          </div>
        </section>
      )}

      <section className="container grid gap-4 py-10 md:grid-cols-3">
        <Link to="/map" className="rounded-xl border bg-card p-5 shadow-sm transition hover:shadow-md">
          <Map className="mb-2 h-6 w-6 text-primary" />
          <h3 className="font-semibold">Search on the map</h3>
          <p className="text-sm text-muted-foreground">Find rentals near your office, school or the sea — use GPS to see what's around you.</p>
        </Link>
        <Link to="/newspaper" className="rounded-xl border bg-card p-5 shadow-sm transition hover:shadow-md">
          <Newspaper className="mb-2 h-6 w-6 text-primary" />
          <h3 className="font-semibold">Newspaper TO LET archive</h3>
          <p className="text-sm text-muted-foreground">Searchable classifieds from local newspapers, all in one place.</p>
        </Link>
        <div className="rounded-xl border bg-primary p-5 text-primary-foreground shadow-sm">
          <ShieldCheck className="mb-2 h-6 w-6" />
          <h3 className="font-semibold">Own a property?</h3>
          <p className="mb-3 text-sm text-white/85">List it free, upload photos, and respond to enquiries from verified tenants.</p>
          <Button asChild variant="secondary" size="sm">
            <Link to={user ? (isOwner ? '/properties/new' : '/profile?tab=account') : '/signup'}>List your property</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}

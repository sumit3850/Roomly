import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Map as MapIcon, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSaved } from '@/hooks/useSaved'
import { useReferenceData } from '@/hooks/useReferenceData'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/layout/PageHeader'
import { PropertyCard, PropertyCardSkeleton } from '@/components/property/PropertyCard'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/misc'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CONFIGURATIONS, FURNISHING } from '@/lib/constants'
import { cn, errorMessage } from '@/lib/utils'
import { orSafe } from '@/components/tenant/listingQuery'
import type { Listing } from '@/types/db'

const PAGE = 24
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Rent: low to high' },
  { value: 'price_desc', label: 'Rent: high to low' },
  { value: 'views', label: 'Most viewed' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-2"><h4 className="text-sm font-semibold">{title}</h4>{children}</div>
}

function FilterPanel({ params, set, toggleConfig }: {
  params: URLSearchParams
  set: (k: string, v: string | null) => void
  toggleConfig: (c: string) => void
}) {
  const { categories } = useReferenceData()
  const configs = params.getAll('config')
  const type = params.get('type') ?? 'all'
  return (
    <div className="space-y-5">
      <Section title="Location">
        <Input
          defaultValue={params.get('q') ?? ''}
          key={params.get('q') ?? ''}
          placeholder="Area, landmark, island"
          onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value.trim() || null) }}
          onBlur={(e) => { if ((e.target.value.trim() || null) !== params.get('q')) set('q', e.target.value.trim() || null) }}
        />
      </Section>
      <Section title="Property type">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {[['all', 'All'], ['residential', 'Homes'], ['commercial', 'Commercial']].map(([v, l]) => (
            <button key={v} onClick={() => set('type', v === 'all' ? null : v)} className={cn('rounded-md py-1.5 text-xs font-medium', type === v ? 'bg-background shadow' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
      </Section>
      <Section title="Configuration">
        <div className="flex flex-wrap gap-1.5">
          {CONFIGURATIONS.map((c) => (
            <button key={c} onClick={() => toggleConfig(c)} aria-pressed={configs.includes(c)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition', configs.includes(c) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>{c}</button>
          ))}
        </div>
      </Section>
      <Section title="Monthly rent (₹)">
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" inputMode="numeric" min={0} placeholder="Min" defaultValue={params.get('min') ?? ''} key={`min${params.get('min')}`}
            onBlur={(e) => set('min', e.target.value || null)} aria-label="Minimum rent" />
          <Input type="number" inputMode="numeric" min={0} placeholder="Max" defaultValue={params.get('max') ?? ''} key={`max${params.get('max')}`}
            onBlur={(e) => set('max', e.target.value || null)} aria-label="Maximum rent" />
        </div>
      </Section>
      <Section title="Category">
        <NativeSelect value={params.get('category') ?? ''} onChange={(e) => set('category', e.target.value || null)}>
          <option value="">Any category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
      </Section>
      <Section title="Furnishing">
        <NativeSelect value={params.get('furnishing') ?? ''} onChange={(e) => set('furnishing', e.target.value || null)}>
          <option value="">Any</option>
          {FURNISHING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </NativeSelect>
      </Section>
      <div className="space-y-2.5">
        {[['verified', 'Verified listings only'], ['now', 'Available now'], ['rented', 'Include rented properties']].map(([k, l]) => (
          <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={params.get(k) === '1'} onChange={(e) => set(k, e.target.checked ? '1' : null)} />
            {l}
          </label>
        ))}
      </div>
    </div>
  )
}

export default function Search() {
  useDocumentTitle('Search properties')
  const [params, setParams] = useSearchParams()
  const { savedIds, toggleSaved } = useSaved()
  const [rows, setRows] = useState<Listing[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const key = params.toString()

  const set = useCallback((k: string, v: string | null) => {
    setParams((prev) => { const n = new URLSearchParams(prev); if (v === null || v === '') n.delete(k); else n.set(k, v); return n }, { replace: true })
  }, [setParams])
  const toggleConfig = useCallback((c: string) => {
    setParams((prev) => {
      const n = new URLSearchParams(prev)
      const cur = n.getAll('config')
      n.delete('config')
      ;(cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]).forEach((x) => n.append('config', x))
      return n
    }, { replace: true })
  }, [setParams])

  const fetchPage = useCallback(async (p: number) => {
    const sp = new URLSearchParams(key)
    let query = supabase.from('property_listings').select('*', { count: 'exact' })
    query = sp.get('rented') === '1' ? query.in('status', ['active', 'rented']) : query.eq('status', 'active')
    const q = orSafe(sp.get('q') ?? '')
    if (q) query = query.or(`title.ilike.%${q}%,area.ilike.%${q}%,landmark.ilike.%${q}%,island.ilike.%${q}%,address_line.ilike.%${q}%`)
    const configs = sp.getAll('config')
    if (configs.length) query = query.in('configuration', configs)
    const min = Number(sp.get('min')); if (sp.get('min') && !isNaN(min)) query = query.gte('rent_amount', min)
    const max = Number(sp.get('max')); if (sp.get('max') && !isNaN(max)) query = query.lte('rent_amount', max)
    const type = sp.get('type')
    if (type === 'commercial') query = query.eq('is_commercial', true)
    if (type === 'residential') query = query.eq('is_commercial', false)
    if (sp.get('furnishing')) query = query.eq('furnishing', sp.get('furnishing')!)
    if (sp.get('category')) query = query.eq('category_id', sp.get('category')!)
    if (sp.get('verified') === '1') query = query.eq('is_verified', true)
    if (sp.get('now') === '1') query = query.or(`available_from.is.null,available_from.lte.${new Date().toISOString().slice(0, 10)}`)
    switch (sp.get('sort')) {
      case 'price_asc': query = query.order('rent_amount', { ascending: true }); break
      case 'price_desc': query = query.order('rent_amount', { ascending: false }); break
      case 'views': query = query.order('views_count', { ascending: false }); break
      default: query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false })
    }
    return query.range(p * PAGE, p * PAGE + PAGE - 1)
  }, [key])

  useEffect(() => {
    let active = true
    setLoading(true); setError(null); setPage(0)
    fetchPage(0).then(({ data, count, error }) => {
      if (!active) return
      if (error) setError(errorMessage(error))
      setRows((data ?? []) as Listing[])
      setTotal(count ?? 0)
      setLoading(false)
    })
    return () => { active = false }
  }, [fetchPage])

  async function loadMore() {
    setLoadingMore(true)
    const { data, error } = await fetchPage(page + 1)
    setLoadingMore(false)
    if (error) { setError(errorMessage(error)); return }
    setRows((prev) => [...prev, ...((data ?? []) as Listing[])])
    setPage((p) => p + 1)
  }

  const activeCount = useMemo(() => {
    const sp = new URLSearchParams(key); sp.delete('sort'); return [...sp.keys()].length
  }, [key])

  return (
    <div className="container py-6">
      <PageHeader
        title="Search properties"
        description={loading ? 'Searching…' : `${total} ${total === 1 ? 'property' : 'properties'} found`}
        actions={<>
          <NativeSelect value={params.get('sort') ?? 'newest'} onChange={(e) => set('sort', e.target.value === 'newest' ? null : e.target.value)} className="w-44" aria-label="Sort">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </NativeSelect>
          <Button variant="outline" className="lg:hidden" onClick={() => setFiltersOpen(true)}><SlidersHorizontal /> Filters{activeCount ? ` (${activeCount})` : ''}</Button>
          <Button asChild variant="outline"><Link to={`/map?${key}`}><MapIcon /> Map view</Link></Button>
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-xl border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Filters</h3>
              {activeCount > 0 && <button onClick={() => setParams({}, { replace: true })} className="text-xs text-primary hover:underline">Clear all</button>}
            </div>
            <FilterPanel params={params} set={set} toggleConfig={toggleConfig} />
          </div>
        </aside>
        <div>
          {error && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <PropertyCardSkeleton key={i} />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={<SearchX />} title="No properties match your filters" description="Try widening your budget, removing filters, or searching a nearby area."
              action={activeCount > 0 ? <Button variant="outline" onClick={() => setParams({}, { replace: true })}><X /> Clear filters</Button> : undefined} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((l) => <PropertyCard key={l.id} listing={l} saved={savedIds.has(l.id)} onToggleSave={toggleSaved} />)}
              </div>
              {rows.length < total && (
                <div className="mt-6 text-center">
                  <Button variant="outline" onClick={loadMore} loading={loadingMore}>Load more ({total - rows.length} remaining)</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Filters</DialogTitle></DialogHeader>
          <FilterPanel params={params} set={set} toggleConfig={toggleConfig} />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setParams({}, { replace: true })}>Clear all</Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>Show {total} results</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

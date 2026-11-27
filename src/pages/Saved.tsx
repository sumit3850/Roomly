import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/layout/PageHeader'
import { PropertyCard, PropertyCardSkeleton } from '@/components/property/PropertyCard'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { fetchListingsByIds } from '@/components/tenant/listingQuery'
import { errorMessage, timeAgo } from '@/lib/utils'
import type { Listing } from '@/types/db'

export default function Saved() {
  useDocumentTitle('Saved properties')
  const { user } = useAuth()
  const [items, setItems] = useState<{ listing: Listing; saved_at: string }[] | null>(null)

  useEffect(() => {
    if (!user) return
    let active = true
    ;(async () => {
      const { data, error } = await supabase.from('saved_properties').select('property_id, created_at').eq('user_id', user.id).order('created_at', { ascending: false })
      if (error) { toast.error(errorMessage(error)); setItems([]); return }
      const rows = (data ?? []) as { property_id: string; created_at: string }[]
      try {
        const listings = await fetchListingsByIds(rows.map((r) => r.property_id))
        const byId = new Map(listings.map((l) => [l.id, l]))
        if (active) setItems(rows.filter((r) => byId.has(r.property_id)).map((r) => ({ listing: byId.get(r.property_id)!, saved_at: r.created_at })))
      } catch (e) { toast.error(errorMessage(e)); if (active) setItems([]) }
    })()
    return () => { active = false }
  }, [user])

  async function remove(id: string) {
    const prev = items
    setItems((cur) => cur?.filter((i) => i.listing.id !== id) ?? null)
    const { error } = await supabase.from('saved_properties').delete().eq('user_id', user!.id).eq('property_id', id)
    if (error) { setItems(prev); toast.error(errorMessage(error)) } else toast.success('Removed from saved')
  }

  return (
    <div className="container py-6">
      <PageHeader title="Saved properties" description={items ? `${items.length} saved` : undefined} />
      {items === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <PropertyCardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Heart />} title="No saved properties yet" description="Tap the heart on any listing to save it here for later."
          action={<Button asChild><Link to="/search">Browse properties</Link></Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map(({ listing, saved_at }) => (
            <div key={listing.id}>
              <PropertyCard listing={listing} saved onToggleSave={remove} />
              <p className="mt-1 px-1 text-xs text-muted-foreground">Saved {timeAgo(saved_at)}{listing.status === 'rented' ? ' · now rented' : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { Link } from 'react-router-dom'
import { BadgeCheck, Heart, ImageOff, MapPin, Star, Store } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { BUCKETS, publicUrl } from '@/lib/supabase'
import { cn, formatINR } from '@/lib/utils'
import type { Listing } from '@/types/db'

export function PropertyCard({ listing, saved, onToggleSave, compact, className }: {
  listing: Listing
  saved?: boolean
  onToggleSave?: (id: string) => void
  compact?: boolean
  className?: string
}) {
  const img = publicUrl(BUCKETS.propertyImages, listing.cover_path)
  return (
    <div className={cn('group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md', className)}>
      <Link to={`/property/${listing.id}`} className="block">
        <div className={cn('relative bg-muted', compact ? 'aspect-[16/10]' : 'aspect-[4/3]')}>
          {img ? (
            <img src={img} alt={listing.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-8 w-8" /></div>
          )}
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            <Badge className="bg-background/95 text-foreground shadow-sm">{listing.configuration}</Badge>
            {listing.is_commercial && <Badge className="bg-violet-600 text-white"><Store className="h-3 w-3" /> Commercial</Badge>}
            {listing.status === 'rented' && <Badge variant="destructive" className="bg-destructive text-white">Rented</Badge>}
          </div>
        </div>
        <div className="space-y-1.5 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold text-primary">{formatINR(listing.rent_amount)}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
            {listing.avg_rating ? (
              <span className="flex items-center gap-0.5 text-xs font-medium"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{listing.avg_rating}</span>
            ) : null}
          </div>
          <h3 className="line-clamp-1 font-semibold">
            {listing.title}
            {listing.is_verified && <BadgeCheck className="ml-1 inline h-4 w-4 text-success" aria-label="Verified" />}
          </h3>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-1">{[listing.area, listing.island].filter(Boolean).join(', ') || 'Location not set'}</span>
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground">
              {listing.furnishing.replace('-', ' ')}
              {listing.area_sqft ? ` · ${listing.area_sqft} sq.ft` : ''}
              {listing.security_deposit ? ` · Deposit ${formatINR(listing.security_deposit)}` : ''}
            </p>
          )}
        </div>
      </Link>
      {onToggleSave && (
        <button
          onClick={() => onToggleSave(listing.id)}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-background/95 shadow-sm transition hover:scale-105"
          aria-label={saved ? 'Remove from saved' : 'Save property'}
          aria-pressed={saved}
        >
          <Heart className={cn('h-4 w-4', saved ? 'fill-destructive text-destructive' : 'text-foreground')} />
        </button>
      )}
    </div>
  )
}

export function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="aspect-[4/3] animate-pulse bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

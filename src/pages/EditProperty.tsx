import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { PropertyForm, type PropertyFormInitial } from '@/components/owner/PropertyForm'
import { EmptyState, Spinner } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import type { Property, PropertyImage, PropertyLocation } from '@/types/db'

export default function EditProperty() {
  useDocumentTitle('Edit property')
  const { id } = useParams<{ id: string }>()
  const { user, isAdmin } = useAuth()
  const [initial, setInitial] = useState<PropertyFormInitial | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'denied' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id || !user) return
    let active = true
    ;(async () => {
      const [p, l, a, i] = await Promise.all([
        supabase.from('properties').select('*').eq('id', id).maybeSingle(),
        supabase.from('property_locations').select('*').eq('property_id', id).maybeSingle(),
        supabase.from('property_amenities').select('amenity_id').eq('property_id', id),
        supabase.from('property_images').select('*').eq('property_id', id).order('sort_order'),
      ])
      if (!active) return
      if (p.error) { setError(errorMessage(p.error)); setState('error'); return }
      if (!p.data) { setState('notfound'); return }
      const prop = p.data as Property
      if (prop.owner_id !== user.id && !isAdmin) { setState('denied'); return }
      setInitial({
        property: prop,
        location: (l.data as PropertyLocation) ?? null,
        amenityIds: ((a.data ?? []) as { amenity_id: string }[]).map((x) => x.amenity_id),
        images: (i.data ?? []) as PropertyImage[],
      })
      setState('ready')
    })()
    return () => { active = false }
  }, [id, user, isAdmin])

  if (state === 'loading') return <Spinner label="Loading listing…" />
  if (state !== 'ready' || !initial) {
    return (
      <div className="container py-10">
        <EmptyState
          icon={<ShieldAlert />}
          title={state === 'denied' ? 'You can only edit your own listings' : state === 'notfound' ? 'Listing not found' : 'Could not load listing'}
          description={state === 'error' ? error : undefined}
          action={<Button asChild><Link to="/dashboard/owner">Back to dashboard</Link></Button>}
        />
      </div>
    )
  }
  return (
    <div className="container max-w-3xl py-6">
      <PageHeader title="Edit property" description={initial.property.title} actions={<Button asChild variant="outline" size="sm"><Link to={`/property/${initial.property.id}`}>View listing</Link></Button>} />
      <PropertyForm key={initial.property.id} initial={initial} />
    </div>
  )
}

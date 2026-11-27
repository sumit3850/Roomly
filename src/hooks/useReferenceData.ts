import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Amenity, Category } from '@/types/db'

let cache: { categories: Category[]; amenities: Amenity[] } | null = null

export function useReferenceData() {
  const [data, setData] = useState(cache ?? { categories: [], amenities: [] })
  const [loading, setLoading] = useState(!cache)
  useEffect(() => {
    if (cache) return
    Promise.all([
      supabase.from('property_categories').select('*').order('sort_order'),
      supabase.from('amenities').select('*').order('name'),
    ]).then(([c, a]) => {
      cache = { categories: (c.data ?? []) as Category[], amenities: (a.data ?? []) as Amenity[] }
      setData(cache)
      setLoading(false)
    })
  }, [])
  return { ...data, loading }
}

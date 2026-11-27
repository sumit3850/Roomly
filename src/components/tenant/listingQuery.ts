import { supabase } from '@/lib/supabase'
import type { Listing } from '@/types/db'

/** Escape characters that would break a PostgREST or() filter */
export function orSafe(s: string) {
  return s.replace(/[,()*%\\]/g, ' ').trim()
}

export async function fetchListingsByIds(ids: string[]): Promise<Listing[]> {
  if (!ids.length) return []
  const { data, error } = await supabase.from('property_listings').select('*').in('id', ids)
  if (error) throw error
  return (data ?? []) as Listing[]
}

import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { errorMessage } from '@/lib/utils'

/** Saved-property ids for the signed-in user, with optimistic toggle. */
export function useSaved() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [ids, setIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) { setIds(new Set()); return }
    supabase.from('saved_properties').select('property_id').eq('user_id', user.id).then(({ data }) => {
      setIds(new Set((data ?? []).map((r: { property_id: string }) => r.property_id)))
    })
  }, [user])

  const toggle = useCallback(async (propertyId: string) => {
    if (!user) {
      toast.info('Sign in to save properties')
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    const wasSaved = ids.has(propertyId)
    setIds((prev) => { const n = new Set(prev); wasSaved ? n.delete(propertyId) : n.add(propertyId); return n })
    const { error } = wasSaved
      ? await supabase.from('saved_properties').delete().eq('user_id', user.id).eq('property_id', propertyId)
      : await supabase.from('saved_properties').insert({ user_id: user.id, property_id: propertyId })
    if (error) {
      setIds((prev) => { const n = new Set(prev); wasSaved ? n.add(propertyId) : n.delete(propertyId); return n })
      toast.error(errorMessage(error))
    } else {
      toast.success(wasSaved ? 'Removed from saved' : 'Saved to favourites')
    }
  }, [user, ids, navigate, location.pathname])

  return { savedIds: ids, toggleSaved: toggle }
}

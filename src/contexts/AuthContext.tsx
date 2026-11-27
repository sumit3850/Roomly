import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { AppRole, Profile } from '@/types/db'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  roles: AppRole[]
  loading: boolean
  isAdmin: boolean
  isOwner: boolean
  hasRole: (r: AppRole) => boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)
  const manualSignOut = useRef(false)
  const hadSession = useRef(false)

  const loadUserData = useCallback(async (uid: string) => {
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', uid),
    ])
    if (p.error) console.error('profile load failed', p.error)
    setProfile((p.data as Profile) ?? null)
    setRoles(((r.data ?? []) as { role: AppRole }[]).map((x) => x.role))
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return
      if (error) console.error(error)
      setSession(data.session)
      hadSession.current = !!data.session
      if (data.session) await loadUserData(data.session.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setRoles([])
        if (hadSession.current && !manualSignOut.current) {
          toast.warning('Your session has expired. Please sign in again.')
        }
        manualSignOut.current = false
        hadSession.current = false
        return
      }
      if (s) {
        hadSession.current = true
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
          // defer: never await Supabase calls inside the auth callback
          setTimeout(() => { void loadUserData(s.user.id) }, 0)
        }
      }
    })

    // Re-validate the session when the tab regains focus (handles expiry while backgrounded)
    const onFocus = () => { void supabase.auth.getSession() }
    window.addEventListener('focus', onFocus)
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [loadUserData])

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadUserData(session.user.id)
  }, [session?.user, loadUserData])

  const signOut = useCallback(async () => {
    manualSignOut.current = true
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) toast.error(error.message)
    else toast.success('Signed out')
  }, [])

  const value = useMemo<AuthState>(() => {
    const hasRole = (r: AppRole) => roles.includes(r)
    return {
      session,
      user: session?.user ?? null,
      profile,
      roles,
      loading,
      isAdmin: roles.includes('admin'),
      isOwner: roles.includes('owner') || roles.includes('commercial_owner') || roles.includes('admin'),
      hasRole,
      refreshProfile,
      signOut,
    }
  }, [session, profile, roles, loading, refreshProfile, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

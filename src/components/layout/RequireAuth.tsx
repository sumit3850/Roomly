import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Spinner, EmptyState } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import type { AppRole } from '@/types/db'

export function RequireAuth({ children, roles, anyOwner }: { children: ReactNode; roles?: AppRole[]; anyOwner?: boolean }) {
  const { user, loading, roles: mine, isOwner, profile } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner label="Checking your session…" />
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (profile?.is_suspended) {
    return (
      <div className="container py-10">
        <EmptyState icon={<ShieldAlert />} title="Account suspended" description="Your account has been suspended by an administrator. Please contact support." action={<Button asChild><Link to="/help">Contact support</Link></Button>} />
      </div>
    )
  }
  const allowed = (!roles || roles.some((r) => mine.includes(r))) && (!anyOwner || isOwner)
  if (!allowed) {
    return (
      <div className="container py-10">
        <EmptyState
          icon={<ShieldAlert />}
          title="You don't have access to this page"
          description={anyOwner ? 'Enable the Property Owner role in your profile to list properties.' : 'This area is restricted.'}
          action={<Button asChild><Link to={anyOwner ? '/profile?tab=account' : '/'}>{anyOwner ? 'Manage account type' : 'Go home'}</Link></Button>}
        />
      </div>
    )
  }
  return <>{children}</>
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (user) {
    const next = new URLSearchParams(location.search).get('next')
    return <Navigate to={next && next.startsWith('/') ? next : '/dashboard'} replace />
  }
  return <>{children}</>
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AuthShell } from '@/components/layout/AuthShell'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { safeNext } from '@/components/auth/shared'

export default function AuthCallback() {
  useDocumentTitle('Signing you in')
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(() => {
    const q = new URLSearchParams(window.location.search)
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error')
  })

  useEffect(() => {
    if (error) return
    const q = new URLSearchParams(window.location.search)
    const next = safeNext(q.get('next'))
    const type = q.get('type') || new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type')
    let done = false
    const finish = () => {
      if (done) return
      done = true
      if (type === 'recovery') { navigate('/reset-password', { replace: true }); return }
      toast.success(type === 'email_change' ? 'Email address updated' : 'Email verified — you are signed in')
      navigate(next, { replace: true })
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { done = true; navigate('/reset-password', { replace: true }); return }
      if (session) finish()
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) finish() })
    const t = setTimeout(async () => {
      if (done) return
      const { data } = await supabase.auth.getSession()
      if (data.session) finish()
      else setError('We could not verify this link. It may have expired or already been used. If you just confirmed your email, try signing in.')
    }, 8000)
    return () => { clearTimeout(t); sub.subscription.unsubscribe() }
  }, [error, navigate])

  if (error) {
    return (
      <AuthShell title="Verification failed">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="grid w-full gap-2">
            <Button asChild><Link to="/login">Sign in</Link></Button>
            <Button asChild variant="outline"><Link to="/verify-email">Resend verification email</Link></Button>
          </div>
        </div>
      </AuthShell>
    )
  }
  return <AuthShell title="Signing you in"><Spinner label="Confirming your account…" /></AuthShell>
}

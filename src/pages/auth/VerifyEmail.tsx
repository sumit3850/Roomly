import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, MailCheck } from 'lucide-react'
import { supabase, SITE_URL } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { AuthShell } from '@/components/layout/AuthShell'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCooldown } from '@/components/auth/shared'

export default function VerifyEmail() {
  useDocumentTitle('Verify your email')
  const [params] = useSearchParams()
  const { user } = useAuth()
  const email = params.get('email') || user?.email || ''
  const [sending, setSending] = useState(false)
  const cooldown = useCooldown(30)

  if (user?.email_confirmed_at) {
    return (
      <AuthShell title="Email verified" description="Your email address is confirmed.">
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <Button asChild className="w-full"><Link to="/dashboard">Continue to dashboard</Link></Button>
        </div>
      </AuthShell>
    )
  }

  async function resend() {
    if (!email) { toast.error('Missing email address. Please sign up again.'); return }
    setSending(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${SITE_URL}/auth/callback` } })
    setSending(false)
    if (error) toast.error(errorMessage(error))
    else { toast.success('Verification email sent again'); cooldown.start(60) }
  }

  return (
    <AuthShell
      title="Check your inbox"
      description="One more step to activate your account"
      footer={<>Already verified? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link></>}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <MailCheck className="h-12 w-12 text-primary" />
        <p className="text-sm">
          We sent a verification link to {email ? <strong className="break-all">{email}</strong> : 'your email address'}.
          Open it on this device to confirm your account.
        </p>
        <p className="text-xs text-muted-foreground">Can't find it? Check your spam or promotions folder. Links expire after 24 hours.</p>
        <Button variant="outline" className="w-full" onClick={resend} loading={sending} disabled={cooldown.left > 0 || !email}>
          {cooldown.left > 0 ? `Resend email in ${cooldown.left}s` : 'Resend verification email'}
        </Button>
        <Link to="/signup" className="text-sm text-muted-foreground hover:underline">Used the wrong email? Sign up again</Link>
      </div>
    </AuthShell>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import { AuthShell } from '@/components/layout/AuthShell'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, Spinner } from '@/components/ui/misc'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { passwordSchema } from '@/components/auth/shared'

const schema = z.object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Form = z.infer<typeof schema>

function urlError(): string | null {
  const q = new URLSearchParams(window.location.search)
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error')
}

export default function ResetPassword() {
  useDocumentTitle('Set a new password')
  const navigate = useNavigate()
  const [state, setState] = useState<'waiting' | 'ready' | 'invalid'>('waiting')
  const [linkError, setLinkError] = useState<string | null>(urlError())
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (linkError) { setState('invalid'); return }
    let settled = false
    const ready = () => { settled = true; setState('ready') }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION'))) ready()
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) ready() })
    // If the URL carries a PKCE code, wait a little longer for the exchange
    const hasCode = new URLSearchParams(window.location.search).has('code')
    const t = setTimeout(async () => {
      if (settled) return
      const { data } = await supabase.auth.getSession()
      if (data.session) ready()
      else { setState('invalid'); setLinkError((e) => e ?? 'This reset link is invalid or has expired.') }
    }, hasCode ? 6000 : 3000)
    return () => { clearTimeout(t); sub.subscription.unsubscribe() }
  }, [linkError])

  async function onSubmit(v: Form) {
    const { error } = await supabase.auth.updateUser({ password: v.password })
    if (error) {
      toast.error(/same/i.test(error.message) ? 'New password must be different from your old one' : errorMessage(error))
      return
    }
    toast.success('Password updated')
    navigate('/dashboard', { replace: true })
  }

  if (state === 'waiting') return <AuthShell title="Set a new password"><Spinner label="Verifying your reset link…" /></AuthShell>

  if (state === 'invalid') {
    return (
      <AuthShell title="Link invalid or expired">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="text-sm text-muted-foreground">{linkError}</p>
          <Button asChild className="w-full"><Link to="/forgot-password">Request a new link</Link></Button>
          <Link to="/login" className="text-sm text-primary hover:underline">Back to sign in</Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Set a new password" description="Choose a strong password with letters and numbers">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="rp-pass" error={errors.password?.message}>
          <Input id="rp-pass" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <Field label="Confirm new password" htmlFor="rp-confirm" error={errors.confirm?.message}>
          <Input id="rp-confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Update password</Button>
      </form>
    </AuthShell>
  )
}

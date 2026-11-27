import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MessageSquareText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { AuthShell } from '@/components/layout/AuthShell'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/misc'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { safeNext, smsErrorHint, useCooldown } from '@/components/auth/shared'

const schema = z.object({ token: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') })
type Form = z.infer<typeof schema>

export default function VerifyPhone() {
  useDocumentTitle('Verify mobile number')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
  const phone = params.get('phone') || ''
  const mode = (params.get('mode') || 'login') as 'signup' | 'login' | 'change'
  const next = safeNext(params.get('next'), mode === 'change' ? '/profile?tab=contact' : '/dashboard')
  const cooldown = useCooldown(60)
  const [resending, setResending] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return (
      <AuthShell title="Missing mobile number" description="Start again from sign in or sign up.">
        <div className="grid gap-2">
          <Button asChild><Link to="/login?tab=phone">Sign in with mobile</Link></Button>
          <Button asChild variant="outline"><Link to="/signup">Create an account</Link></Button>
        </div>
      </AuthShell>
    )
  }

  async function onSubmit(v: Form) {
    setErrorText(null)
    const { error } = await supabase.auth.verifyOtp({ phone, token: v.token, type: mode === 'change' ? 'phone_change' : 'sms' })
    if (error) {
      setErrorText(/expired|invalid/i.test(error.message) ? 'The code is invalid or has expired. Request a new one.' : smsErrorHint(errorMessage(error)))
      return
    }
    await refreshProfile()
    toast.success(mode === 'change' ? 'Mobile number updated' : mode === 'signup' ? 'Mobile verified — welcome to Roomly!' : 'Signed in')
    navigate(next, { replace: true })
  }

  async function resend() {
    setResending(true)
    setErrorText(null)
    const { error } = mode === 'change'
      ? await supabase.auth.updateUser({ phone })
      : await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: mode === 'signup' } })
    setResending(false)
    if (error) { toast.error(smsErrorHint(errorMessage(error))); return }
    toast.success('A new code has been sent')
    cooldown.start(60)
  }

  return (
    <AuthShell
      title="Enter verification code"
      description={`We sent a 6-digit code by SMS to ${phone}`}
      footer={<Link to={mode === 'change' ? '/profile?tab=contact' : mode === 'signup' ? '/signup' : '/login?tab=phone'} className="hover:underline">Wrong number? Go back</Link>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="flex justify-center"><MessageSquareText className="h-10 w-10 text-primary" /></div>
        <Field label="One-time code" htmlFor="otp" error={errors.token?.message}>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            autoFocus
            className="h-12 text-center text-2xl font-semibold tracking-[0.5em]"
            aria-invalid={!!errors.token}
            {...register('token')}
          />
        </Field>
        {errorText && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive" role="alert">{errorText}</p>}
        <Button type="submit" className="w-full" loading={isSubmitting}>Verify</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={resend} loading={resending} disabled={cooldown.left > 0}>
          {cooldown.left > 0 ? `Resend code in ${cooldown.left}s` : 'Resend code'}
        </Button>
      </form>
    </AuthShell>
  )
}

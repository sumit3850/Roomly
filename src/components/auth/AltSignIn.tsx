import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { supabase, SITE_URL, GOOGLE_AUTH_ENABLED } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/misc'
import { useCooldown } from './shared'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  )
}

/** Free social sign-in. Hidden unless VITE_ENABLE_GOOGLE_AUTH=true. */
export function GoogleButton({ next = '/dashboard', label = 'Continue with Google' }: { next?: string; label?: string }) {
  const [busy, setBusy] = useState(false)
  if (!GOOGLE_AUTH_ENABLED) return null
  async function go() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
    })
    if (error) { toast.error(errorMessage(error)); setBusy(false) }
  }
  return (
    <div className="mb-4 space-y-4">
      <Button type="button" variant="outline" className="w-full" onClick={() => void go()} loading={busy}>
        {!busy && <GoogleIcon />} {label}
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') })
const codeSchema = z.object({ token: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') })

/**
 * Free passwordless login: Supabase emails a one-time sign-in link and 6-digit code.
 * (The code appears if the "Magic Link" email template contains {{ .Token }}.)
 */
export function EmailCodeLogin({ next }: { next: string }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState<string | null>(null)
  const cooldown = useCooldown(0)
  const emailForm = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema) })
  const codeForm = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema) })

  async function send(addr: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: false, emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
    })
    if (error) {
      const msg = /signups not allowed|user not found/i.test(error.message)
        ? 'No account with this email. Please create an account first.'
        : errorMessage(error)
      toast.error(msg)
      return false
    }
    cooldown.start()
    toast.success('Check your email for the sign-in code')
    return true
  }

  async function verify(v: z.infer<typeof codeSchema>) {
    if (!email) return
    const { error } = await supabase.auth.verifyOtp({ email, token: v.token, type: 'email' })
    if (error) { toast.error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Request a new one.' : errorMessage(error)); return }
    toast.success('Signed in')
    navigate(next, { replace: true })
  }

  if (!email) {
    return (
      <form onSubmit={emailForm.handleSubmit(async (v) => { if (await send(v.email)) setEmail(v.email) })} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="code-email" error={emailForm.formState.errors.email?.message}>
          <Input id="code-email" type="email" autoComplete="email" placeholder="you@example.com" {...emailForm.register('email')} />
        </Field>
        <Button type="submit" className="w-full" loading={emailForm.formState.isSubmitting}>Email me a sign-in code</Button>
        <p className="text-center text-xs text-muted-foreground">No password needed. Free and works on any phone.</p>
      </form>
    )
  }

  return (
    <form onSubmit={codeForm.handleSubmit(verify)} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        We sent a sign-in email to <span className="font-medium text-foreground">{email}</span>. Enter the 6-digit code from it, or just tap the link in the email.
      </p>
      <Field label="6-digit code" htmlFor="code-token" error={codeForm.formState.errors.token?.message}>
        <Input id="code-token" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" className="text-center text-lg tracking-[0.4em]" {...codeForm.register('token')} />
      </Field>
      <Button type="submit" className="w-full" loading={codeForm.formState.isSubmitting}>Sign in</Button>
      <div className="flex justify-between text-sm">
        <button type="button" className="text-muted-foreground hover:underline" onClick={() => { setEmail(null); codeForm.reset() }}>Use another email</button>
        <button type="button" className="font-medium text-primary hover:underline disabled:opacity-50" disabled={cooldown.left > 0} onClick={() => void send(email)}>
          {cooldown.left > 0 ? `Resend in ${cooldown.left}s` : 'Resend code'}
        </button>
      </div>
    </form>
  )
}

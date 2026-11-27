import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Mail, Smartphone } from 'lucide-react'
import { supabase, SITE_URL } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import { AuthShell } from '@/components/layout/AuthShell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input, NativeSelect } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/misc'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { COUNTRY_CODES, buildPhone, safeNext, smsErrorHint, useCooldown } from '@/components/auth/shared'

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
type EmailForm = z.infer<typeof emailSchema>

const phoneSchema = z.object({
  country_code: z.string(),
  number: z.string().trim().regex(/^\d{6,12}$/, 'Enter digits only'),
}).refine((d) => d.country_code !== '+91' || /^[6-9]\d{9}$/.test(d.number), { path: ['number'], message: 'Enter a valid 10-digit Indian mobile number' })
type PhoneForm = z.infer<typeof phoneSchema>

function EmailLogin({ next }: { next: string }) {
  const navigate = useNavigate()
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const cooldown = useCooldown()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EmailForm>({ resolver: zodResolver(emailSchema) })

  async function onSubmit(v: EmailForm) {
    setUnconfirmed(null)
    const { error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password })
    if (error) {
      if (/not confirmed/i.test(error.message)) { setUnconfirmed(v.email); return }
      toast.error(/invalid login/i.test(error.message) ? 'Incorrect email or password' : errorMessage(error))
      return
    }
    toast.success('Signed in')
    navigate(next, { replace: true })
  }

  async function resend() {
    if (!unconfirmed) return
    setResending(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email: unconfirmed, options: { emailRedirectTo: `${SITE_URL}/auth/callback` } })
    setResending(false)
    if (error) toast.error(errorMessage(error))
    else { toast.success('Verification email sent'); cooldown.start(60) }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {unconfirmed && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>Please verify your email address before signing in. Check your inbox for the confirmation link.</p>
          <Button type="button" size="sm" variant="outline" onClick={resend} loading={resending} disabled={cooldown.left > 0}>
            {cooldown.left > 0 ? `Resend in ${cooldown.left}s` : 'Resend verification email'}
          </Button>
        </div>
      )}
      <Field label="Email address" htmlFor="li-email" error={errors.email?.message}>
        <Input id="li-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
      </Field>
      <Field label="Password" htmlFor="li-pass" error={errors.password?.message}>
        <Input id="li-pass" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register('password')} />
      </Field>
      <div className="text-right text-sm">
        <Link to="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
    </form>
  )
}

function PhoneLogin({ next }: { next: string }) {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { country_code: '+91' },
  })
  async function onSubmit(v: PhoneForm) {
    const phone = buildPhone(v.country_code, v.number)
    if (!phone) { toast.error('Invalid mobile number'); return }
    const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } })
    if (error) {
      if (/signups not allowed|not found|user not found/i.test(error.message)) {
        toast.error('No account found for this number. Please sign up first.')
      } else toast.error(smsErrorHint(errorMessage(error)))
      return
    }
    toast.success(`OTP sent to ${phone}`)
    navigate(`/verify-phone?phone=${encodeURIComponent(phone)}&mode=login&next=${encodeURIComponent(next)}`)
  }
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Registered mobile number" htmlFor="lp-number" error={errors.number?.message} hint="We'll send a one-time code by SMS">
        <div className="flex gap-2">
          <NativeSelect className="w-28 shrink-0" aria-label="Country code" {...register('country_code')}>
            {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </NativeSelect>
          <Input id="lp-number" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98xxxxxxxx" aria-invalid={!!errors.number} {...register('number')} />
        </div>
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>Send OTP</Button>
    </form>
  )
}

export default function Login() {
  useDocumentTitle('Sign in')
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to manage listings, saved homes and enquiries"
      footer={<>New to Roomly? <Link to="/signup" className="font-medium text-primary hover:underline">Create an account</Link></>}
    >
      <Tabs defaultValue={params.get('tab') === 'phone' ? 'phone' : 'email'}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="email"><Mail className="h-4 w-4" /> Email</TabsTrigger>
          <TabsTrigger value="phone"><Smartphone className="h-4 w-4" /> Mobile OTP</TabsTrigger>
        </TabsList>
        <TabsContent value="email"><EmailLogin next={next} /></TabsContent>
        <TabsContent value="phone"><PhoneLogin next={next} /></TabsContent>
      </Tabs>
    </AuthShell>
  )
}

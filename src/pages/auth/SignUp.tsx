import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Mail, Smartphone } from 'lucide-react'
import { supabase, SITE_URL } from '@/lib/supabase'
import { toE164, errorMessage } from '@/lib/utils'
import { AuthShell } from '@/components/layout/AuthShell'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input, NativeSelect } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/misc'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { AccountTypePicker, COUNTRY_CODES, accountTypeSchema, buildPhone, passwordSchema, smsErrorHint } from '@/components/auth/shared'

const emailSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter your full name').max(120),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: passwordSchema,
    confirm: z.string(),
    phone: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || toE164(v) !== null, 'Enter a valid mobile number'),
    account_type: accountTypeSchema,
  })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type EmailForm = z.infer<typeof emailSchema>

const phoneSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(120),
  country_code: z.string(),
  number: z.string().trim().regex(/^\d{6,12}$/, 'Enter digits only'),
  account_type: accountTypeSchema,
}).refine((d) => d.country_code !== '+91' || /^[6-9]\d{9}$/.test(d.number), { path: ['number'], message: 'Enter a valid 10-digit Indian mobile number' })
type PhoneForm = z.infer<typeof phoneSchema>

function EmailSignUp() {
  const navigate = useNavigate()
  const [exists, setExists] = useState(false)
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { account_type: 'tenant', phone: '' },
  })

  async function onSubmit(v: EmailForm) {
    setExists(false)
    const phone = v.phone ? toE164(v.phone) : null
    const { data, error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback`,
        data: { full_name: v.full_name, phone, account_type: v.account_type },
      },
    })
    if (error) {
      if (/already registered|already exists/i.test(error.message)) { setExists(true); return }
      toast.error(errorMessage(error))
      return
    }
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setExists(true)
      return
    }
    if (data.session) {
      toast.success('Welcome to Roomly!')
      navigate('/dashboard', { replace: true })
    } else {
      toast.success('Check your inbox to verify your email')
      navigate(`/verify-email?email=${encodeURIComponent(v.email)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {exists && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          An account with this email already exists. <Link to="/login" className="font-medium underline">Sign in</Link> or{' '}
          <Link to="/forgot-password" className="font-medium underline">reset your password</Link>.
        </div>
      )}
      <Field label="Full name" htmlFor="su-name" error={errors.full_name?.message} required>
        <Input id="su-name" autoComplete="name" aria-invalid={!!errors.full_name} {...register('full_name')} />
      </Field>
      <Field label="Email address" htmlFor="su-email" error={errors.email?.message} required>
        <Input id="su-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" htmlFor="su-pass" error={errors.password?.message} required>
          <Input id="su-pass" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="su-confirm" error={errors.confirm?.message} required>
          <Input id="su-confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />
        </Field>
      </div>
      <Field label="Mobile number (optional)" htmlFor="su-phone" error={errors.phone?.message} hint="10-digit numbers default to +91">
        <Input id="su-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98xxxxxxxx" aria-invalid={!!errors.phone} {...register('phone')} />
      </Field>
      <Field label="I am a…" error={errors.account_type?.message} required>
        <Controller control={control} name="account_type" render={({ field }) => <AccountTypePicker value={field.value} onChange={field.onChange} />} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
    </form>
  )
}

function PhoneSignUp() {
  const navigate = useNavigate()
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { account_type: 'tenant', country_code: '+91' },
  })

  async function onSubmit(v: PhoneForm) {
    const phone = buildPhone(v.country_code, v.number)
    if (!phone) { toast.error('Invalid mobile number'); return }
    const { data: exists } = await supabase.rpc('identity_exists', { _phone: phone })
    if (exists) {
      toast.error('This mobile number is already registered. Please sign in instead.')
      navigate(`/login?tab=phone`)
      return
    }
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true, data: { full_name: v.full_name, account_type: v.account_type } },
    })
    if (error) { toast.error(smsErrorHint(errorMessage(error))); return }
    toast.success(`OTP sent to ${phone}`)
    navigate(`/verify-phone?phone=${encodeURIComponent(phone)}&mode=signup`)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Full name" htmlFor="sp-name" error={errors.full_name?.message} required>
        <Input id="sp-name" autoComplete="name" aria-invalid={!!errors.full_name} {...register('full_name')} />
      </Field>
      <Field label="Mobile number" htmlFor="sp-number" error={errors.number?.message} required hint="We'll send a 6-digit code by SMS">
        <div className="flex gap-2">
          <NativeSelect className="w-28 shrink-0" aria-label="Country code" {...register('country_code')}>
            {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </NativeSelect>
          <Input id="sp-number" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98xxxxxxxx" aria-invalid={!!errors.number} {...register('number')} />
        </div>
      </Field>
      <Field label="I am a…" required>
        <Controller control={control} name="account_type" render={({ field }) => <AccountTypePicker value={field.value} onChange={field.onChange} />} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>Send OTP</Button>
    </form>
  )
}

export default function SignUp() {
  useDocumentTitle('Create account')
  return (
    <AuthShell
      title="Create your account"
      description="Find or list homes across the Andaman & Nicobar Islands"
      footer={<>Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link></>}
    >
      <Tabs defaultValue="email">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="email"><Mail className="h-4 w-4" /> Email</TabsTrigger>
          <TabsTrigger value="phone"><Smartphone className="h-4 w-4" /> Mobile</TabsTrigger>
        </TabsList>
        <TabsContent value="email"><EmailSignUp /></TabsContent>
        <TabsContent value="phone"><PhoneSignUp /></TabsContent>
      </Tabs>
    </AuthShell>
  )
}

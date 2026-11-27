import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MailCheck } from 'lucide-react'
import { supabase, SITE_URL } from '@/lib/supabase'
import { AuthShell } from '@/components/layout/AuthShell'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/misc'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const schema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') })
type Form = z.infer<typeof schema>

export default function ForgotPassword() {
  useDocumentTitle('Forgot password')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  async function onSubmit(v: Form) {
    const { error } = await supabase.auth.resetPasswordForEmail(v.email, { redirectTo: `${SITE_URL}/reset-password` })
    if (error && /rate limit|too many/i.test(error.message)) {
      toast.error('Too many requests. Please wait a minute and try again.')
      return
    }
    // Generic response either way: don't reveal whether the email is registered.
    setSentTo(v.email)
  }

  return (
    <AuthShell
      title="Reset your password"
      description="We'll email you a secure link to choose a new password"
      footer={<>Remembered it? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link></>}
    >
      {sentTo ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="h-12 w-12 text-primary" />
          <p className="text-sm">If an account exists for <strong className="break-all">{sentTo}</strong>, a password reset link is on its way.</p>
          <p className="text-xs text-muted-foreground">The link expires in 1 hour. Check your spam folder if you don't see it.</p>
          <Button variant="outline" onClick={() => setSentTo(null)}>Use a different email</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Email address" htmlFor="fp-email" error={errors.email?.message}>
            <Input id="fp-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button>
          <p className="text-center text-xs text-muted-foreground">
            Registered with a mobile number? You don't need a password — <Link to="/login?tab=phone" className="text-primary hover:underline">sign in with OTP</Link>.
          </p>
        </form>
      )}
    </AuthShell>
  )
}

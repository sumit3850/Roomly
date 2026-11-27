import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle2, LifeBuoy, Mail, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/misc'
import { errorMessage } from '@/lib/utils'

const FAQ: { section: string; items: [string, string][] }[] = [
  {
    section: 'For tenants',
    items: [
      ['How do I contact an owner?', 'Open any listing and use "Send enquiry". Signed-in users can also see the owner\'s phone number and WhatsApp link. Replies appear in My Enquiries and as notifications.'],
      ['Is Roomly free for tenants?', 'Yes. Searching, saving properties and sending enquiries are free.'],
      ['How do I search near my office or school?', 'Open the Map view and tap "Near me" (allow location access), or pan the map to the area you want. Only listings with GPS coordinates appear on the map.'],
      ['Who can write reviews?', 'Only people who enquired about or rented a property. Reviews from tenants whose rental was confirmed by the owner get a "Verified tenant" badge.'],
    ],
  },
  {
    section: 'For owners',
    items: [
      ['How do I list my property?', 'Sign up as a Property Owner (or enable the owner role under Profile → Account type), then tap "List property". Add photos, rent, deposit, GPS location and amenities.'],
      ['How do I mark a property as rented?', 'In the Owner dashboard, choose "Mark rented" on the listing. You can link it to the tenant\'s enquiry so they can leave a verified review. Use "Relist" when it becomes vacant again.'],
      ['How does listing verification work?', 'Administrators review listings and mark genuine ones as Verified. Editing the title, rent, description or configuration removes the badge until it is reviewed again.'],
      ['Can I be both an owner and a tenant?', 'Yes. Every account can browse and enquire. Owner and commercial-owner roles can be switched on or off from your profile.'],
    ],
  },
  {
    section: 'Account & sign-in',
    items: [
      ['I didn\'t receive the OTP', 'Check the number includes the country code (+91 for India) and that you have network coverage. You can request a new code after 60 seconds. Island networks can delay SMS by a few minutes.'],
      ['I didn\'t get the verification email', 'Check your spam folder, then use "Resend verification email" on the verification page.'],
      ['I forgot my password', 'Use "Forgot password" on the sign-in page. We\'ll email a secure reset link. Phone-only accounts sign in with an OTP instead of a password.'],
      ['How do I get my profile verified?', 'Complete your name and phone number, then request verification from Profile. An administrator will review it.'],
    ],
  },
  {
    section: 'Safety',
    items: [
      ['How do I avoid rental scams?', 'Always visit the property in person before paying anything. Never pay a "booking fee" to someone you haven\'t met, never share an OTP, and be wary of rents far below the local market.'],
      ['How do I report a suspicious listing?', 'Use "Report listing" on the property page. Reports go straight to administrators.'],
    ],
  },
]

const SUBJECTS = ['General question', 'Account / sign-in problem', 'Listing problem', 'Report a scam', 'Feedback', 'Other']

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.string().trim().email('Enter a valid email'),
  subject: z.string().min(1, 'Choose a subject'),
  message: z.string().trim().min(10, 'Please write at least 10 characters').max(2800),
})
type Form = z.infer<typeof schema>

export default function Help() {
  useDocumentTitle('Contact & Help')
  const { user, profile } = useAuth()
  const [sent, setSent] = useState(false)
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', subject: '', message: '' } })
  const { register, formState: { errors, isSubmitting } } = form

  useEffect(() => {
    if (profile?.full_name && !form.getValues('name')) form.setValue('name', profile.full_name)
    const email = profile?.email || user?.email
    if (email && !form.getValues('email')) form.setValue('email', email)
  }, [profile, user, form])

  async function onSubmit(v: Form) {
    const { error } = await supabase.from('user_reports').insert({
      reason: 'support',
      reporter_id: user?.id ?? null,
      reporter_email: v.email,
      reporter_name: v.name,
      details: `[${v.subject}] ${v.message}`,
    })
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Message sent. We\'ll get back to you by email.')
    setSent(true)
    form.reset({ name: v.name, email: v.email, subject: '', message: '' })
  }

  return (
    <div className="container max-w-5xl py-6">
      <PageHeader title="Contact & Help" description="Answers to common questions, and a direct line to the Roomly team." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {FAQ.map((s) => (
            <section key={s.section}>
              <h2 className="mb-2 text-lg font-semibold">{s.section}</h2>
              <div className="divide-y rounded-xl border bg-card">
                {s.items.map(([q, a]) => (
                  <details key={q} className="group p-4 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 font-medium">
                      {q}
                      <span className="text-muted-foreground transition group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-2 text-sm text-muted-foreground">{a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" /> Send us a message</CardTitle>
              <CardDescription>We usually reply within one working day.</CardDescription>
            </CardHeader>
            <CardContent>
              {sent ? (
                <div className="space-y-3 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
                  <p className="font-medium">Thanks — your message has been received.</p>
                  <Button variant="outline" size="sm" onClick={() => setSent(false)}>Send another message</Button>
                </div>
              ) : (
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
                  <Field label="Name" htmlFor="h-name" error={errors.name?.message} required><Input id="h-name" {...register('name')} aria-invalid={!!errors.name} /></Field>
                  <Field label="Email" htmlFor="h-email" error={errors.email?.message} required><Input id="h-email" type="email" {...register('email')} aria-invalid={!!errors.email} /></Field>
                  <Field label="Subject" htmlFor="h-subject" error={errors.subject?.message} required>
                    <NativeSelect id="h-subject" {...register('subject')} aria-invalid={!!errors.subject}>
                      <option value="">Choose a subject</option>
                      {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                    </NativeSelect>
                  </Field>
                  <Field label="Message" htmlFor="h-msg" error={errors.message?.message} required><Textarea id="h-msg" rows={5} {...register('message')} aria-invalid={!!errors.message} /></Field>
                  <Button type="submit" className="w-full" loading={isSubmitting}>Send message</Button>
                </form>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-5 text-sm">
              <p className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span><strong>Emergency?</strong> Roomly cannot respond to emergencies. Dial <strong>112</strong> (national emergency number) or contact your nearest police station.</span></p>
              <p className="flex items-start gap-2"><LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Cyber-fraud or online rental scam? Report it at <a className="text-primary underline" href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">cybercrime.gov.in</a> or call the national helpline <strong>1930</strong>.</span></p>
              <p className="text-muted-foreground">Browse the <Link to="/newspaper" className="text-primary hover:underline">newspaper TO LET archive</Link> for listings that haven't been posted online yet.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

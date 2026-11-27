import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { BadgeCheck, Bell, Camera, KeyRound, LogOut, Mail, Phone, ShieldCheck, User as UserIcon, Briefcase } from 'lucide-react'
import { supabase, SITE_URL } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { uploadAvatar } from '@/lib/storage'
import { ACCOUNT_TYPES, POPULAR_AREAS, type AccountType } from '@/lib/constants'
import { errorMessage, formatDate, initials, toE164 } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Field, Spinner } from '@/components/ui/misc'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { passwordSchema } from '@/components/auth/shared'
import type { AppRole, NotificationPrefs, Profile as ProfileRow } from '@/types/db'

const TABS = ['profile', 'contact', 'account', 'security', 'notifications'] as const
type TabKey = (typeof TABS)[number]

// ─── Profile details ────────────────────────────────────────────────
const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name').max(120),
  bio: z.string().trim().max(1000, 'Max 1000 characters').optional(),
  preferred_location: z.string().trim().max(120).optional(),
})
type ProfileForm = z.infer<typeof profileSchema>

function ProfileTab({ profile }: { profile: ProfileRow }) {
  const { user, refreshProfile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: profile.full_name, bio: profile.bio ?? '', preferred_location: profile.preferred_location ?? '' },
  })

  useEffect(() => {
    reset({ full_name: profile.full_name, bio: profile.bio ?? '', preferred_location: profile.preferred_location ?? '' })
  }, [profile, reset])

  async function onSubmit(v: ProfileForm) {
    const { error } = await supabase.from('profiles').update({
      full_name: v.full_name,
      bio: v.bio || null,
      preferred_location: v.preferred_location || null,
    }).eq('id', profile.id)
    if (error) { toast.error(errorMessage(error)); return }
    // keep auth metadata in sync too
    await supabase.auth.updateUser({ data: { full_name: v.full_name } })
    await refreshProfile()
    toast.success('Profile saved')
  }

  async function onAvatar(file?: File) {
    if (!file || !user) return
    setUploading(true)
    try {
      const url = await uploadAvatar(user.id, file)
      const old = profile.avatar_url
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
      if (error) throw error
      // best-effort cleanup of previous avatar in our bucket
      const marker = '/profile-images/'
      if (old && old.includes(marker)) {
        const oldPath = decodeURIComponent(old.split(marker)[1] ?? '')
        if (oldPath.startsWith(`${user.id}/`)) void supabase.storage.from('profile-images').remove([oldPath])
      }
      await refreshProfile()
      toast.success('Profile photo updated')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeAvatar() {
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    if (error) toast.error(errorMessage(error))
    else { await refreshProfile(); toast.success('Photo removed') }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal details</CardTitle>
        <CardDescription>Shown to owners when you enquire, and to tenants on your listings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="Profile photo" />}
            <AvatarFallback className="text-xl">{initials(profile.full_name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onAvatar(e.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              <Camera /> {profile.avatar_url ? 'Change photo' : 'Upload photo'}
            </Button>
            {profile.avatar_url && <Button type="button" variant="ghost" size="sm" onClick={removeAvatar}>Remove</Button>}
            <p className="w-full text-xs text-muted-foreground">JPG, PNG or WebP. Resized automatically.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Full name" htmlFor="pf-name" error={errors.full_name?.message} required>
            <Input id="pf-name" autoComplete="name" aria-invalid={!!errors.full_name} {...register('full_name')} />
          </Field>
          <Field label="Email" htmlFor="pf-email" hint="Change it in the Contact tab">
            <Input id="pf-email" value={profile.email ?? user?.email ?? 'Not added'} disabled readOnly />
          </Field>
          <Field label="Preferred location" htmlFor="pf-loc" error={errors.preferred_location?.message} hint="Used for property recommendations">
            <Input id="pf-loc" list="pf-areas" placeholder="e.g. Dollygunj" {...register('preferred_location')} />
            <datalist id="pf-areas">{POPULAR_AREAS.map((a) => <option key={a} value={a} />)}</datalist>
          </Field>
          <Field label="About you" htmlFor="pf-bio" error={errors.bio?.message}>
            <Textarea id="pf-bio" rows={4} placeholder="A short introduction (optional)" {...register('bio')} />
          </Field>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save changes</Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ─── Contact (email & phone) ────────────────────────────────────────
const emailSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') })
const phoneSchema = z.object({ phone: z.string().trim().refine((v) => toE164(v) !== null, 'Enter a valid mobile number') })

function ContactTab({ profile }: { profile: ProfileRow }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const emailForm = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } })
  const phoneForm = useForm<z.infer<typeof phoneSchema>>({ resolver: zodResolver(phoneSchema), defaultValues: { phone: '' } })

  const currentEmail = user?.email || profile.email
  const currentPhone = user?.phone ? `+${user.phone.replace(/^\+/, '')}` : profile.phone

  async function changeEmail(v: z.infer<typeof emailSchema>) {
    if (v.email === currentEmail) { toast.info('That is already your email'); return }
    const { error } = await supabase.auth.updateUser({ email: v.email }, { emailRedirectTo: `${SITE_URL}/auth/callback?type=email_change` })
    if (error) { toast.error(errorMessage(error)); return }
    setPendingEmail(v.email)
    emailForm.reset({ email: '' })
    toast.success('Confirmation sent — check your inbox')
  }

  async function changePhone(v: z.infer<typeof phoneSchema>) {
    const phone = toE164(v.phone)!
    if (phone === currentPhone) { toast.info('That is already your number'); return }
    const { data: taken } = await supabase.rpc('identity_exists', { _phone: phone })
    if (taken) { toast.error('This number is already linked to another account'); return }
    const { error } = await supabase.auth.updateUser({ phone })
    if (error) { toast.error(errorMessage(error)); return }
    toast.success(`OTP sent to ${phone}`)
    navigate(`/verify-phone?mode=change&phone=${encodeURIComponent(phone)}`)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Email address</CardTitle>
          <CardDescription>Used for sign-in, password reset and notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium break-all">{currentEmail || 'No email added'}</span>
            {currentEmail && (user?.email_confirmed_at
              ? <Badge variant="success"><BadgeCheck className="h-3 w-3" /> Verified</Badge>
              : <Badge variant="warning">Unverified</Badge>)}
          </div>
          {pendingEmail && (
            <p className="rounded-md bg-accent p-2 text-xs">
              We sent a confirmation link to <strong>{pendingEmail}</strong>{currentEmail ? ' (and possibly your current address)' : ''}. Your email changes once confirmed.
            </p>
          )}
          <form onSubmit={emailForm.handleSubmit(changeEmail)} className="space-y-3" noValidate>
            <Field label={currentEmail ? 'New email address' : 'Add email address'} htmlFor="ct-email" error={emailForm.formState.errors.email?.message}>
              <Input id="ct-email" type="email" autoComplete="email" {...emailForm.register('email')} />
            </Field>
            <Button type="submit" variant="outline" loading={emailForm.formState.isSubmitting}>
              {currentEmail ? 'Change email' : 'Add email'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Mobile number</CardTitle>
          <CardDescription>Verified by SMS OTP. Lets you sign in without a password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{currentPhone || 'No mobile added'}</span>
            {currentPhone && (user?.phone_confirmed_at
              ? <Badge variant="success"><BadgeCheck className="h-3 w-3" /> Verified</Badge>
              : <Badge variant="warning">Unverified</Badge>)}
          </div>
          <form onSubmit={phoneForm.handleSubmit(changePhone)} className="space-y-3" noValidate>
            <Field label={currentPhone ? 'New mobile number' : 'Add mobile number'} htmlFor="ct-phone" error={phoneForm.formState.errors.phone?.message} hint="10-digit numbers default to +91">
              <Input id="ct-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98xxxxxxxx" {...phoneForm.register('phone')} />
            </Field>
            <Button type="submit" variant="outline" loading={phoneForm.formState.isSubmitting}>
              {currentPhone ? 'Change & verify' : 'Add & verify'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Account type, roles, verification ─────────────────────────────
const VERIFICATION_BADGE: Record<ProfileRow['verification_status'], { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  verified: { label: 'Verified', variant: 'success' },
  pending: { label: 'Verification pending', variant: 'warning' },
  unverified: { label: 'Not verified', variant: 'muted' },
  rejected: { label: 'Verification rejected', variant: 'destructive' },
}

function AccountTab({ profile }: { profile: ProfileRow }) {
  const { roles, refreshProfile } = useAuth()
  const [acct, setAcct] = useState<AccountType>(profile.account_type)
  const [savingType, setSavingType] = useState(false)
  const [busyRole, setBusyRole] = useState<AppRole | null>(null)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => { setAcct(profile.account_type) }, [profile.account_type])

  async function saveAccountType() {
    setSavingType(true)
    try {
      const { error } = await supabase.from('profiles').update({ account_type: acct }).eq('id', profile.id)
      if (error) throw error
      if (acct !== 'tenant' && !roles.includes(acct)) {
        const r = await supabase.rpc('set_self_role', { _role: acct, _enabled: true })
        if (r.error) throw r.error
      }
      await refreshProfile()
      toast.success('Account type updated')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSavingType(false)
    }
  }

  async function toggleRole(role: AppRole, enabled: boolean) {
    setBusyRole(role)
    const { error } = await supabase.rpc('set_self_role', { _role: role, _enabled: enabled })
    setBusyRole(null)
    if (error) { toast.error(errorMessage(error)); return }
    await refreshProfile()
    toast.success(enabled ? 'Role enabled' : 'Role disabled')
  }

  async function requestVerification() {
    setRequesting(true)
    const { error } = await supabase.from('profiles').update({ verification_status: 'pending' }).eq('id', profile.id)
    setRequesting(false)
    if (error) { toast.error(errorMessage(error)); return }
    await refreshProfile()
    toast.success('Verification requested. An administrator will review your account.')
  }

  const vb = VERIFICATION_BADGE[profile.verification_status]
  const roleRows: { role: AppRole; label: string; description: string }[] = [
    { role: 'owner', label: 'Property Owner / Landlord', description: 'List and manage residential properties' },
    { role: 'commercial_owner', label: 'Commercial Property Owner', description: 'List shops, offices and godowns' },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" /> Account type</CardTitle>
          <CardDescription>Your primary role. You can act as a tenant and an owner at the same time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Primary account type" htmlFor="ac-type">
            <NativeSelect id="ac-type" value={acct} onChange={(e) => setAcct(e.target.value as AccountType)}>
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </NativeSelect>
          </Field>
          <Button onClick={saveAccountType} loading={savingType} disabled={acct === profile.account_type}>Save account type</Button>
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Roles</p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm">Tenant / Property Seeker</p>
                <p className="text-xs text-muted-foreground">Always on — browse, save and enquire</p>
              </div>
              <Switch checked disabled aria-label="Tenant role" />
            </div>
            {roleRows.map((r) => (
              <div key={r.role} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
                <Switch
                  checked={roles.includes(r.role)}
                  disabled={busyRole !== null}
                  onCheckedChange={(v) => void toggleRole(r.role, v)}
                  aria-label={r.label}
                />
              </div>
            ))}
            {roles.includes('admin') && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">Administrator</p>
                  <p className="text-xs text-muted-foreground">Granted by the platform team</p>
                </div>
                <Badge><ShieldCheck className="h-3 w-3" /> Admin</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BadgeCheck className="h-5 w-5" /> Verification status</CardTitle>
          <CardDescription>Verified accounts get a badge that builds trust with tenants and owners.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Badge variant={vb.variant} className="text-sm">{vb.label}</Badge>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>Member since {formatDate(profile.created_at)}</li>
            <li>Email: {profile.email ? 'added' : 'not added'}</li>
            <li>Mobile: {profile.phone ? 'added' : 'not added'}</li>
          </ul>
          {(profile.verification_status === 'unverified' || profile.verification_status === 'rejected') && (
            <Button variant="outline" onClick={requestVerification} loading={requesting}>Request verification</Button>
          )}
          {profile.verification_status === 'pending' && <p className="text-sm text-muted-foreground">An administrator is reviewing your request.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Security ──────────────────────────────────────────────────────
const pwSchema = z.object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' })

function SecurityTab() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [globalBusy, setGlobalBusy] = useState(false)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) })

  async function onSubmit(v: z.infer<typeof pwSchema>) {
    const { error } = await supabase.auth.updateUser({ password: v.password })
    if (error) {
      toast.error(/reauthentication|recent/i.test(error.message)
        ? 'For security, please sign in again before changing your password.'
        : /same/i.test(error.message) ? 'New password must be different from the current one' : errorMessage(error))
      return
    }
    reset({ password: '', confirm: '' })
    toast.success('Password changed')
  }

  async function signOutEverywhere() {
    setGlobalBusy(true)
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    setGlobalBusy(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Signed out of all devices')
    navigate('/login')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> {user?.email ? 'Change password' : 'Set a password'}</CardTitle>
          <CardDescription>
            {user?.email ? 'Use at least 8 characters with letters and numbers.' : 'Add an email in the Contact tab to enable password sign-in.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Field label="New password" htmlFor="sc-pass" error={errors.password?.message}>
              <Input id="sc-pass" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
            </Field>
            <Field label="Confirm new password" htmlFor="sc-confirm" error={errors.confirm?.message}>
              <Input id="sc-confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />
            </Field>
            <Button type="submit" loading={isSubmitting}>Update password</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LogOut className="h-5 w-5" /> Sessions</CardTitle>
          <CardDescription>Last sign-in: {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={async () => { await signOut(); navigate('/') }}>Sign out</Button>
          <Button variant="destructive" onClick={signOutEverywhere} loading={globalBusy}>Sign out of all devices</Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Notifications ─────────────────────────────────────────────────
const PREF_ROWS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: 'enquiries', label: 'New enquiries', description: 'When a tenant enquires about one of your listings' },
  { key: 'enquiry_responses', label: 'Owner replies', description: 'When an owner responds to your enquiry' },
  { key: 'recommendations', label: 'Recommendations', description: 'New listings matching your preferences' },
  { key: 'marketing', label: 'News & tips', description: 'Occasional updates about Roomly' },
]

function NotificationsTab({ profile }: { profile: ProfileRow }) {
  const { refreshProfile } = useAuth()
  const defaults: NotificationPrefs = { enquiries: true, enquiry_responses: true, recommendations: true, marketing: false }
  const [prefs, setPrefs] = useState<NotificationPrefs>({ ...defaults, ...(profile.notification_prefs ?? {}) })
  const [saving, setSaving] = useState<keyof NotificationPrefs | null>(null)

  async function toggle(key: keyof NotificationPrefs, value: boolean) {
    const nextPrefs = { ...prefs, [key]: value }
    setPrefs(nextPrefs)
    setSaving(key)
    const { error } = await supabase.from('profiles').update({ notification_prefs: nextPrefs }).eq('id', profile.id)
    setSaving(null)
    if (error) {
      setPrefs(prefs)
      toast.error(errorMessage(error))
      return
    }
    await refreshProfile()
    toast.success('Preferences saved')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notification preferences</CardTitle>
        <CardDescription>Choose which in-app notifications you receive.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {PREF_ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.description}</p>
            </div>
            <Switch checked={prefs[r.key]} disabled={saving !== null} onCheckedChange={(v) => void toggle(r.key, v)} aria-label={r.label} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ─── Page ───────────────────────────────────────────────────────────
export default function Profile() {
  useDocumentTitle('Profile & settings')
  const { profile, loading } = useAuth()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as TabKey | null
  const tab: TabKey = tabParam && TABS.includes(tabParam) ? tabParam : 'profile'

  if (loading) return <Spinner />
  if (!profile) {
    return (
      <div className="container py-8">
        <Spinner label="Loading your profile…" />
        <p className="text-center text-sm text-muted-foreground">If this takes too long, make sure the database migrations have been applied.</p>
      </div>
    )
  }

  return (
    <div className="container max-w-5xl py-6 sm:py-8">
      <PageHeader title="Profile & settings" description="Manage your personal details, account type and security." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="profile"><UserIcon className="h-4 w-4" /> Profile</TabsTrigger>
          <TabsTrigger value="contact"><Phone className="h-4 w-4" /> Contact</TabsTrigger>
          <TabsTrigger value="account"><Briefcase className="h-4 w-4" /> Account</TabsTrigger>
          <TabsTrigger value="security"><KeyRound className="h-4 w-4" /> Security</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4" /> Alerts</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab profile={profile} /></TabsContent>
        <TabsContent value="contact"><ContactTab profile={profile} /></TabsContent>
        <TabsContent value="account"><AccountTab profile={profile} /></TabsContent>
        <TabsContent value="security"><SecurityTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab profile={profile} /></TabsContent>
      </Tabs>
    </div>
  )
}

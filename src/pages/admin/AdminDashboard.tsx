import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertTriangle, BadgeCheck, Building2, Eye, Flag, Home, KeyRound, MessageSquare, Newspaper, Search, Shield, Star, Trash2, Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm'
import { EmptyState, Field, Spinner, StatCard } from '@/components/ui/misc'
import { errorMessage, formatDate, formatINR, timeAgo } from '@/lib/utils'
import { REPORT_REASONS } from '@/lib/constants'
import type { AppRole, Listing, Profile, PropertyStatus, UserReport } from '@/types/db'

interface AdminStats {
  users: number; properties: number; active: number; rented: number; unverified: number; enquiries: number
  open_reports: number; publications: number; advertisements: number; pending_verifications: number
}
type TabKey = 'listings' | 'users' | 'reports' | 'archive'

export default function AdminDashboard() {
  useDocumentTitle('Admin')
  const [params, setParams] = useSearchParams()
  const tab = (['listings', 'users', 'reports', 'archive'].includes(params.get('tab') ?? '') ? params.get('tab') : 'listings') as TabKey
  const [stats, setStats] = useState<AdminStats | null>(null)

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_stats')
    if (error) { toast.error(errorMessage(error)); return }
    setStats(data as AdminStats)
  }, [])
  useEffect(() => { void loadStats() }, [loadStats])

  return (
    <div className="container py-6">
      <PageHeader title="Admin dashboard" description="Moderate listings, manage users and handle reports. All actions are authorised server-side." />
      {stats ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Users" value={stats.users} icon={<Users />} />
          <StatCard label="Listings" value={stats.properties} icon={<Building2 />} />
          <StatCard label="Active" value={stats.active} icon={<Home />} />
          <StatCard label="Rented" value={stats.rented} icon={<KeyRound />} />
          <StatCard label="Unverified active" value={stats.unverified} icon={<AlertTriangle />} />
          <StatCard label="Enquiries" value={stats.enquiries} icon={<MessageSquare />} />
          <StatCard label="Open reports" value={stats.open_reports} icon={<Flag />} />
          <StatCard label="Pending ID checks" value={stats.pending_verifications} icon={<BadgeCheck />} />
          <StatCard label="Editions" value={stats.publications} icon={<Newspaper />} />
          <StatCard label="Archive adverts" value={stats.advertisements} icon={<Newspaper />} />
        </div>
      ) : <Spinner label="Loading stats…" />}

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="reports">Reports {stats?.open_reports ? <Badge variant="destructive" className="px-1.5">{stats.open_reports}</Badge> : null}</TabsTrigger>
          <TabsTrigger value="archive">Archive</TabsTrigger>
        </TabsList>
        <TabsContent value="listings"><ListingsAdmin onChange={loadStats} /></TabsContent>
        <TabsContent value="users"><UsersAdmin onChange={loadStats} /></TabsContent>
        <TabsContent value="reports"><ReportsAdmin onChange={loadStats} /></TabsContent>
        <TabsContent value="archive">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="flex items-center gap-2 font-semibold"><Newspaper className="h-5 w-5" /> Newspaper TO LET archive</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {stats ? `${stats.publications} editions · ${stats.advertisements} adverts.` : ''} Upload new edition PDFs, review extracted adverts and delete editions from the archive page (admin tools appear at the top for administrators).
            </p>
            <Button asChild className="mt-4"><Link to="/newspaper">Open archive tools</Link></Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Listings moderation ────────────────────────────────────────────────
function ListingsAdmin({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'' | PropertyStatus>('')
  const [onlyUnverified, setOnlyUnverified] = useState(false)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t) }, [q])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('property_listings').select('*').order('created_at', { ascending: false }).limit(200)
    if (status) query = query.eq('status', status)
    if (onlyUnverified) query = query.eq('is_verified', false)
    if (debounced) {
      const s = debounced.replace(/[%,()*\\]/g, ' ')
      query = query.or(`title.ilike.%${s}%,area.ilike.%${s}%,contact_phone.ilike.%${s}%`)
    }
    const { data, error } = await query
    if (error) toast.error(errorMessage(error))
    setRows((data ?? []) as Listing[])
    setLoading(false)
  }, [status, onlyUnverified, debounced])
  useEffect(() => { void load() }, [load])

  async function update(id: string, patch: Record<string, unknown>, msg: string) {
    const { error } = await supabase.from('properties').update(patch).eq('id', id)
    if (error) return toast.error(errorMessage(error))
    toast.success(msg)
    await load(); onChange()
  }
  async function remove(id: string) {
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Listing deleted')
    await load(); onChange()
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, area or phone" className="pl-9" />
        </div>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as PropertyStatus | '')} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option><option value="draft">Draft</option><option value="rented">Rented</option><option value="inactive">Inactive</option>
        </NativeSelect>
        <label className="flex items-center gap-2 rounded-md border px-3 text-sm">
          <input type="checkbox" checked={onlyUnverified} onChange={(e) => setOnlyUnverified(e.target.checked)} /> Unverified only
        </label>
      </div>
      {loading ? <Spinner /> : !rows.length ? <EmptyState icon={<Building2 />} title="No listings match" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Listing</th><th className="p-3">Rent</th><th className="p-3">Status</th><th className="p-3">Views</th><th className="p-3">Created</th><th className="p-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-t align-top">
                  <td className="p-3">
                    <Link to={`/property/${l.id}`} className="font-medium hover:underline">{l.title}</Link>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
                      <span>{l.configuration}</span>·<span>{l.area ?? '—'}</span>{l.contact_phone && <>·<span>{l.contact_phone}</span></>}
                    </div>
                    <div className="mt-1 flex gap-1">
                      {l.is_verified && <Badge variant="success"><BadgeCheck className="h-3 w-3" /> Verified</Badge>}
                      {l.is_featured && <Badge variant="warning"><Star className="h-3 w-3" /> Featured</Badge>}
                      {l.is_commercial && <Badge variant="secondary">Commercial</Badge>}
                    </div>
                  </td>
                  <td className="p-3">{formatINR(l.rent_amount)}</td>
                  <td className="p-3"><Badge variant="outline" className="capitalize">{l.status}</Badge></td>
                  <td className="p-3"><span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{l.views_count}</span></td>
                  <td className="p-3 text-xs">{formatDate(l.created_at)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button size="sm" variant={l.is_verified ? 'outline' : 'success'}
                        onClick={() => void update(l.id, { is_verified: !l.is_verified }, l.is_verified ? 'Verification removed' : 'Listing verified')}>
                        {l.is_verified ? 'Unverify' : 'Verify'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void update(l.id, { is_featured: !l.is_featured }, l.is_featured ? 'Unfeatured' : 'Featured')}>
                        {l.is_featured ? 'Unfeature' : 'Feature'}
                      </Button>
                      {l.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => void update(l.id, { status: 'inactive' }, 'Listing deactivated')}>Deactivate</Button>
                      )}
                      <ConfirmDialog title="Delete this listing?" description={l.title} destructive confirmLabel="Delete" onConfirm={() => remove(l.id)}
                        trigger={(open) => <Button size="sm" variant="ghost" className="text-destructive" onClick={open} aria-label="Delete"><Trash2 /></Button>} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Users ──────────────────────────────────────────────────────────────
const MANAGED_ROLES: { role: AppRole; label: string }[] = [
  { role: 'owner', label: 'Owner' },
  { role: 'commercial_owner', label: 'Commercial' },
  { role: 'admin', label: 'Admin' },
]

function UsersAdmin({ onChange }: { onChange: () => void }) {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [roles, setRoles] = useState<Record<string, AppRole[]>>({})
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [verif, setVerif] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t) }, [q])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(200)
    if (verif) query = query.eq('verification_status', verif)
    if (debounced) {
      const s = debounced.replace(/[%,()*\\]/g, ' ')
      query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`)
    }
    const { data, error } = await query
    if (error) toast.error(errorMessage(error))
    const list = (data ?? []) as Profile[]
    setUsers(list)
    if (list.length) {
      const { data: r } = await supabase.from('user_roles').select('user_id, role').in('user_id', list.map((u) => u.id))
      const map: Record<string, AppRole[]> = {}
      ;((r ?? []) as { user_id: string; role: AppRole }[]).forEach((x) => { (map[x.user_id] ??= []).push(x.role) })
      setRoles(map)
    }
    setLoading(false)
  }, [debounced, verif])
  useEffect(() => { void load() }, [load])

  async function toggleRole(uid: string, role: AppRole, enabled: boolean) {
    const { error } = await supabase.rpc('admin_set_role', { _user_id: uid, _role: role, _enabled: enabled })
    if (error) return toast.error(errorMessage(error))
    toast.success(`${enabled ? 'Granted' : 'Revoked'} ${role.replace('_', ' ')} role`)
    setRoles((prev) => ({ ...prev, [uid]: enabled ? [...(prev[uid] ?? []), role] : (prev[uid] ?? []).filter((r) => r !== role) }))
  }
  async function patch(uid: string, p: Partial<Profile>, msg: string) {
    const { error } = await supabase.from('profiles').update(p).eq('id', uid)
    if (error) return toast.error(errorMessage(error))
    toast.success(msg)
    setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, ...p } : u)))
    onChange()
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" className="pl-9" />
        </div>
        <NativeSelect value={verif} onChange={(e) => setVerif(e.target.value)} aria-label="Verification status">
          <option value="">Any verification</option>
          <option value="pending">Pending review</option><option value="verified">Verified</option>
          <option value="unverified">Unverified</option><option value="rejected">Rejected</option>
        </NativeSelect>
      </div>
      <p className="flex items-start gap-2 rounded-lg bg-accent p-3 text-xs text-accent-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0" />
        Roles are changed through a server-side function that re-checks your admin role. The first administrator must be granted from the Supabase SQL editor (see README); users can never choose admin at sign-up.
      </p>
      {loading ? <Spinner /> : !users.length ? <EmptyState icon={<Users />} title="No users found" /> : (
        <div className="space-y-2">
          {users.map((u) => {
            const r = roles[u.id] ?? []
            return (
              <div key={u.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{u.full_name || 'Unnamed user'}</span>
                    {u.id === me?.id && <Badge variant="outline">You</Badge>}
                    <Badge variant={u.verification_status === 'verified' ? 'success' : u.verification_status === 'pending' ? 'warning' : u.verification_status === 'rejected' ? 'destructive' : 'muted'} className="capitalize">{u.verification_status}</Badge>
                    {u.is_suspended && <Badge variant="destructive">Suspended</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{[u.email, u.phone].filter(Boolean).join(' · ') || 'No contact'} · joined {formatDate(u.created_at)} · {u.account_type.replace('_', ' ')}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MANAGED_ROLES.map(({ role, label }) => {
                    const on = r.includes(role)
                    const selfAdmin = role === 'admin' && u.id === me?.id
                    return (
                      <ConfirmDialog key={role}
                        title={`${on ? 'Revoke' : 'Grant'} ${label} role?`}
                        description={role === 'admin' ? 'Administrators can moderate everything on the platform.' : undefined}
                        destructive={on}
                        confirmLabel={on ? 'Revoke' : 'Grant'}
                        onConfirm={() => toggleRole(u.id, role, !on)}
                        trigger={(open) => (
                          <Button size="sm" variant={on ? 'default' : 'outline'} onClick={open} disabled={selfAdmin && on} title={selfAdmin && on ? 'You cannot remove your own admin role' : undefined}>
                            {label}
                          </Button>
                        )}
                      />
                    )
                  })}
                  {u.verification_status !== 'verified' && <Button size="sm" variant="success" onClick={() => void patch(u.id, { verification_status: 'verified' }, 'User verified')}>Verify</Button>}
                  {u.verification_status === 'pending' && <Button size="sm" variant="outline" onClick={() => void patch(u.id, { verification_status: 'rejected' }, 'Verification rejected')}>Reject</Button>}
                  {u.id !== me?.id && (
                    <ConfirmDialog
                      title={u.is_suspended ? 'Unsuspend this user?' : 'Suspend this user?'}
                      description={u.is_suspended ? undefined : 'Suspended users cannot publish listings or send enquiries.'}
                      destructive={!u.is_suspended}
                      confirmLabel={u.is_suspended ? 'Unsuspend' : 'Suspend'}
                      onConfirm={() => patch(u.id, { is_suspended: !u.is_suspended }, u.is_suspended ? 'User unsuspended' : 'User suspended')}
                      trigger={(open) => <Button size="sm" variant="ghost" className={u.is_suspended ? '' : 'text-destructive'} onClick={open}>{u.is_suspended ? 'Unsuspend' : 'Suspend'}</Button>}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Reports & support ──────────────────────────────────────────────────
function ReportsAdmin({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<UserReport[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open-ish' | UserReport['status'] | 'all'>('open-ish')
  const [kind, setKind] = useState<'all' | 'support' | 'reports'>('all')
  const [editing, setEditing] = useState<UserReport | null>(null)
  const [notes, setNotes] = useState('')
  const [newStatus, setNewStatus] = useState<UserReport['status']>('reviewing')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('user_reports').select('*').order('created_at', { ascending: false }).limit(200)
    if (filter === 'open-ish') query = query.in('status', ['open', 'reviewing'])
    else if (filter !== 'all') query = query.eq('status', filter)
    if (kind === 'support') query = query.eq('reason', 'support')
    if (kind === 'reports') query = query.neq('reason', 'support')
    const { data, error } = await query
    if (error) toast.error(errorMessage(error))
    const list = (data ?? []) as UserReport[]
    setRows(list)
    const ids = [...new Set(list.map((r) => r.property_id).filter(Boolean))] as string[]
    if (ids.length) {
      const { data: props } = await supabase.from('properties').select('id, title').in('id', ids)
      setTitles(Object.fromEntries(((props ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title])))
    }
    setLoading(false)
  }, [filter, kind])
  useEffect(() => { void load() }, [load])

  const reasonLabel = useMemo(() => Object.fromEntries([...REPORT_REASONS.map((r) => [r.value, r.label]), ['support', 'Support message']]), [])

  async function save() {
    if (!editing) return
    setBusy(true)
    const resolved = newStatus === 'resolved' || newStatus === 'dismissed'
    const { error } = await supabase.from('user_reports').update({
      status: newStatus, admin_notes: notes.trim() || null,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? (await supabase.auth.getUser()).data.user?.id ?? null : null,
    }).eq('id', editing.id)
    setBusy(false)
    if (error) return toast.error(errorMessage(error))
    toast.success('Report updated')
    setEditing(null)
    await load(); onChange()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-auto" aria-label="Status filter">
          <option value="open-ish">Open &amp; reviewing</option><option value="open">Open</option><option value="reviewing">Reviewing</option>
          <option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All</option>
        </NativeSelect>
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-auto" aria-label="Kind">
          <option value="all">Reports &amp; support</option><option value="reports">Listing/user reports</option><option value="support">Support messages</option>
        </NativeSelect>
      </div>
      {loading ? <Spinner /> : !rows.length ? <EmptyState icon={<Flag />} title="Nothing to review" description="New reports and contact messages will show up here." /> : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.reason === 'support' ? 'secondary' : 'destructive'}>{reasonLabel[r.reason] ?? r.reason}</Badge>
                  <Badge variant="outline" className="capitalize">{r.status}</Badge>
                  <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setEditing(r); setNotes(r.admin_notes ?? ''); setNewStatus(r.status === 'open' ? 'reviewing' : r.status) }}>Update</Button>
              </div>
              {r.property_id && <Link to={`/property/${r.property_id}`} className="mt-2 block text-sm text-primary hover:underline">{titles[r.property_id] ?? 'Reported property'}</Link>}
              {r.details && <p className="mt-2 whitespace-pre-line text-sm">{r.details}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                From: {r.reporter_name || (r.reporter_id ? 'Registered user' : 'Visitor')}{r.reporter_email && <> · <a href={`mailto:${r.reporter_email}`} className="text-primary hover:underline">{r.reporter_email}</a></>}
              </p>
              {r.admin_notes && <p className="mt-2 rounded-md bg-muted p-2 text-xs"><strong>Admin notes:</strong> {r.admin_notes}</p>}
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update report</DialogTitle>
            <DialogDescription>{editing ? reasonLabel[editing.reason] : ''}</DialogDescription>
          </DialogHeader>
          <Field label="Status" htmlFor="rep-status">
            <NativeSelect id="rep-status" value={newStatus} onChange={(e) => setNewStatus(e.target.value as UserReport['status'])}>
              <option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
            </NativeSelect>
          </Field>
          <Field label="Admin notes" htmlFor="rep-notes">
            <Textarea id="rep-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={3000} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void save()} loading={busy}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

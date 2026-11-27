import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Building2, Heart, Home, LayoutDashboard, LogOut, Map, MessageSquare, Newspaper, PlusCircle, Search, Shield, User as UserIcon, HelpCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { NotificationBell } from './NotificationBell'
import { InstallAppButton } from './InstallApp'
import { cn, initials } from '@/lib/utils'
import { supabaseConfigured } from '@/lib/supabase'

const navLinks = [
  { to: '/search', label: 'Search', icon: Search },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/newspaper', label: 'TO LET Archive', icon: Newspaper },
  { to: '/help', label: 'Help', icon: HelpCircle },
]

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2 font-bold tracking-tight', className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="h-4 w-4" />
      </span>
      <span className="text-lg">Roomly<span className="text-primary">.</span></span>
    </Link>
  )
}

function UserMenu() {
  const { user, profile, isOwner, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  const name = profile?.full_name || user.email || user.phone || 'Account'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
          <Avatar className="h-9 w-9">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
            <AvatarFallback>{initials(profile?.full_name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/dashboard/tenant')}><LayoutDashboard /> Tenant dashboard</DropdownMenuItem>
        {isOwner && <DropdownMenuItem onSelect={() => navigate('/dashboard/owner')}><Building2 /> Owner dashboard</DropdownMenuItem>}
        {isOwner && <DropdownMenuItem onSelect={() => navigate('/properties/new')}><PlusCircle /> Add property</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => navigate('/saved')}><Heart /> Saved properties</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/enquiries')}><MessageSquare /> My enquiries</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/profile')}><UserIcon /> Profile & settings</DropdownMenuItem>
        {isAdmin && <DropdownMenuItem onSelect={() => navigate('/admin')}><Shield /> Admin dashboard</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={async () => { await signOut(); navigate('/') }} className="text-destructive focus:text-destructive">
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileNav() {
  const { user, isOwner } = useAuth()
  const items = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/search', label: 'Search', icon: Search },
    { to: '/map', label: 'Map', icon: Map },
    user ? { to: '/saved', label: 'Saved', icon: Heart } : { to: '/newspaper', label: 'Archive', icon: Newspaper },
    user
      ? { to: isOwner ? '/dashboard/owner' : '/dashboard/tenant', label: 'Dashboard', icon: LayoutDashboard }
      : { to: '/login', label: 'Sign in', icon: UserIcon },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="grid grid-cols-5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function AppLayout() {
  const { user, isOwner, loading } = useAuth()
  return (
    <div className="flex min-h-screen flex-col">
      {!supabaseConfigured && (
        <div className="bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground">
          Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart.
        </div>
      )}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="container flex h-14 items-center gap-4">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent', isActive ? 'text-primary' : 'text-muted-foreground')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <InstallAppButton variant="outline" size="sm" label="Install" className="px-2.5" />
            {!loading && user && (
              <>
                {isOwner && (
                  <Button asChild size="sm" className="hidden sm:inline-flex"><Link to="/properties/new"><PlusCircle /> List property</Link></Button>
                )}
                <NotificationBell />
                <UserMenu />
              </>
            )}
            {!loading && !user && (
              <>
                <Button asChild variant="ghost" size="sm"><Link to="/login">Sign in</Link></Button>
                <Button asChild size="sm"><Link to="/signup">Sign up</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>
      <footer className="hidden border-t bg-card md:block">
        <div className="container flex flex-wrap items-center justify-between gap-4 py-6 text-sm text-muted-foreground">
          <Logo className="text-foreground" />
          <p>Homes, rooms &amp; commercial spaces across the Andaman &amp; Nicobar Islands.</p>
          <div className="flex gap-4">
            <Link to="/newspaper" className="hover:text-foreground">TO LET Archive</Link>
            <Link to="/help" className="hover:text-foreground">Contact &amp; Help</Link>
          </div>
        </div>
      </footer>
      <MobileNav />
    </div>
  )
}

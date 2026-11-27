import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Check } from 'lucide-react'
import { ACCOUNT_TYPES, type AccountType } from '@/lib/constants'
import { cn } from '@/lib/utils'

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number')

export const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+971', label: '🇦🇪 +971' },
  { code: '+65', label: '🇸🇬 +65' },
  { code: '+61', label: '🇦🇺 +61' },
] as const

export function buildPhone(cc: string, number: string): string | null {
  const digits = number.replace(/\D/g, '')
  const full = `${cc}${digits}`
  return /^\+[1-9]\d{7,14}$/.test(full) ? full : null
}

export const accountTypeSchema = z.enum(['tenant', 'owner', 'commercial_owner'])

export function AccountTypePicker({ value, onChange }: { value: AccountType; onChange: (v: AccountType) => void }) {
  return (
    <div role="radiogroup" className="grid gap-2">
      {ACCOUNT_TYPES.map((t) => {
        const active = value === t.value
        return (
          <button
            type="button"
            role="radio"
            aria-checked={active}
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
              active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent',
            )}
          >
            <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', active && 'border-primary bg-primary text-primary-foreground')}>
              {active && <Check className="h-3 w-3" />}
            </span>
            <span>
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="block text-xs text-muted-foreground">{t.description}</span>
            </span>
          </button>
        )
      })}
      <p className="text-xs text-muted-foreground">Every account can also browse and enquire as a tenant. You can change this later.</p>
    </div>
  )
}

/** Countdown for resend buttons. */
export function useCooldown(initial = 0) {
  const [left, setLeft] = useState(initial)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return { left, start: (s = 60) => setLeft(s) }
}

export function safeNext(next: string | null | undefined, fallback = '/dashboard') {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback
}

export function smsErrorHint(message: string) {
  const m = message.toLowerCase()
  if (m.includes('sms') || m.includes('phone provider') || m.includes('unsupported phone') || m.includes('twilio') || m.includes('provider')) {
    return `${message}. SMS login requires a phone provider (e.g. Twilio/MessageBird) configured in Supabase → Authentication → Providers → Phone.`
  }
  return message
}

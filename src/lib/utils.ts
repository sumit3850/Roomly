import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
export function formatINR(n?: number | string | null) {
  if (n === null || n === undefined || n === '') return '—'
  return inr.format(Number(n))
}

export function formatDate(d?: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', opts)
}

export function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(d)
}

/** Normalise an Indian mobile (or any E.164) to +<digits>. Returns null if invalid. */
export function toE164(raw: string, defaultCc = '91'): string | null {
  const digits = raw.replace(/[^\d+]/g, '')
  if (!digits) return null
  let out = digits.startsWith('+') ? digits : digits.length === 10 ? `+${defaultCc}${digits}` : `+${digits}`
  out = '+' + out.slice(1).replace(/\D/g, '')
  return /^\+[1-9]\d{7,14}$/.test(out) ? out : null
}

export function errorMessage(e: unknown): string {
  if (!e) return 'Something went wrong'
  if (typeof e === 'string') return e
  const err = e as { message?: string; code?: string; details?: string }
  if (err.code === '23505') return 'This already exists (duplicate).'
  if (err.code === '42501') return 'You do not have permission to do that.'
  return err.message || 'Something went wrong'
}

export function initials(name?: string | null) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?'
}

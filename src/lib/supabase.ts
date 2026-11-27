import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && key)

if (!supabaseConfigured) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.')
}

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'roomly-auth',
  },
})

export const SITE_URL = (import.meta.env.VITE_SITE_URL || window.location.origin + import.meta.env.BASE_URL).replace(/\/$/, '')

/** SMS OTP needs a paid SMS provider in Supabase. Off unless VITE_ENABLE_PHONE_AUTH=true. */
export const PHONE_AUTH_ENABLED = import.meta.env.VITE_ENABLE_PHONE_AUTH === 'true'
/** "Continue with Google" (free) — enable after adding Google in Supabase → Auth → Providers. */
export const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true'

export const BUCKETS = {
  propertyImages: 'property-images',
  profileImages: 'profile-images',
  newspaperPdfs: 'newspaper-pdfs',
  newspaperPages: 'newspaper-extracted-pages',
  propertyDocuments: 'property-documents',
} as const

export function publicUrl(bucket: string, path?: string | null) {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

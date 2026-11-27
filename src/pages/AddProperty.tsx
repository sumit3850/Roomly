import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { PropertyForm, type AdPrefill } from '@/components/owner/PropertyForm'
import { Spinner } from '@/components/ui/misc'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { supabase } from '@/lib/supabase'
import type { Advertisement } from '@/types/db'

export default function AddProperty() {
  useDocumentTitle('Add property')
  const [params] = useSearchParams()
  const fromAd = params.get('fromAd')
  const [prefill, setPrefill] = useState<AdPrefill | undefined>()
  const [loading, setLoading] = useState(!!fromAd)

  useEffect(() => {
    if (!fromAd) return
    supabase.from('newspaper_advertisements').select('*').eq('id', fromAd).maybeSingle().then(({ data }) => {
      const ad = data as Advertisement | null
      if (ad) {
        const rentNum = ad.rent_text ? Number(ad.rent_text.replace(/[^\d]/g, '')) || null : null
        const area = (ad.location_text ?? '').split(',').map((s) => s.trim()).filter(Boolean).pop() ?? ''
        setPrefill({
          title: `${ad.configuration && ad.configuration !== 'Other' && ad.configuration !== 'Commercial' ? ad.configuration + ' ' : ''}for rent — ${(ad.location_text ?? '').slice(0, 80)}`.slice(0, 140),
          area: area.slice(0, 120),
          configuration: ad.configuration ?? undefined,
          rent: rentNum,
          phone: ad.phones[0] ?? null,
          is_commercial: ad.is_commercial,
        })
      }
      setLoading(false)
    })
  }, [fromAd])

  return (
    <div className="container max-w-3xl py-6">
      <PageHeader title="List a property" description={prefill ? 'Prefilled from your newspaper advert — review and complete the details.' : 'Add your home, room or commercial space. Listings are saved directly to your account.'} />
      {loading ? <Spinner label="Loading advert…" /> : <PropertyForm prefill={prefill} />}
    </div>
  )
}

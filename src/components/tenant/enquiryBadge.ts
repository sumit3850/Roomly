import type { EnquiryStatus } from '@/types/db'

export const enquiryBadge: Record<EnquiryStatus, { label: string; variant: 'warning' | 'success' | 'muted' }> = {
  new: { label: 'Awaiting reply', variant: 'warning' },
  responded: { label: 'Owner replied', variant: 'success' },
  closed: { label: 'Closed', variant: 'muted' },
}

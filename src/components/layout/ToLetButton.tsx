import { Link } from 'react-router-dom'
import { ChevronRight, Newspaper } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Big shortcut to the newspaper TO LET tracker, used at the top of home and dashboards. */
export function ToLetButton({ className }: { className?: string }) {
  return (
    <Link
      to="/newspaper"
      className={cn(
        'flex items-center gap-3 rounded-xl bg-gradient-to-r from-[#1a365d] to-[#2b6cb0] p-4 text-white shadow-md transition hover:shadow-lg active:scale-[0.99]',
        className,
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15"><Newspaper className="h-6 w-6" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold">🏠 TO LET Tracker</span>
        <span className="block text-xs text-white/80">Newspaper rentals: 1 BHK, 2 BHK, 3 BHK &amp; single rooms</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0" />
    </Link>
  )
}

import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <div className="container py-16">
      <EmptyState
        icon={<Compass />}
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
        action={<div className="flex gap-2"><Button asChild><Link to="/">Go home</Link></Button><Button asChild variant="outline"><Link to="/search">Browse properties</Link></Button></div>}
      />
    </div>
  )
}

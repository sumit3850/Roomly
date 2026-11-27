import { Component, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { isChunkLoadError } from '@/lib/lazyWithReload'

interface State { error: Error | null }

/** Shows a friendly "Reload" screen instead of a blank page if anything fails to render. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  componentDidCatch(error: Error) { console.error('App error:', error) }

  render() {
    if (!this.state.error) return this.props.children
    const updated = isChunkLoadError(this.state.error)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-4xl">{updated ? '✨' : '⚠️'}</div>
        <h1 className="text-lg font-semibold">{updated ? 'Roomly has been updated' : 'Something went wrong'}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {updated ? 'Tap reload to open the latest version.' : 'Please reload the page. If this keeps happening, contact us from the Help page.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <RefreshCw className="h-4 w-4" /> Reload
        </button>
      </div>
    )
  }
}

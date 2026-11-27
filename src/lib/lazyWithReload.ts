import { lazy, type ComponentType } from 'react'

const KEY = 'roomly-chunk-reload-at'

/**
 * Like React.lazy, but if a page's code file is missing (the site was updated while the
 * app was open), reload once to pick up the new version instead of showing a blank screen.
 */
export function lazyWithReload<T extends ComponentType<object>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (err) {
      let last = 0
      try { last = Number(sessionStorage.getItem(KEY) || 0) } catch { /* ignore */ }
      if (Date.now() - last > 30_000) {
        try { sessionStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ }
        window.location.reload()
        return new Promise<{ default: T }>(() => {}) // wait for the reload
      }
      throw err
    }
  })
}

/** Errors that mean "the app was updated; reload to get the new files". */
export function isChunkLoadError(err: unknown) {
  const msg = String((err as Error)?.message ?? err)
  return /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|Loading chunk/i.test(msg)
}

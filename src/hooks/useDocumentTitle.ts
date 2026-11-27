import { useEffect } from 'react'
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Roomly` : 'Roomly — Andaman & Nicobar Rentals'
  }, [title])
}

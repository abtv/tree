import { useEffect, useState } from 'react'

export function SearchPendingLabel({ previous }: { previous: string }): string {
  const [showPending, setShowPending] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setShowPending(true), 200)
    return () => window.clearTimeout(timer)
  }, [])

  return showPending ? 'Searching…' : previous
}

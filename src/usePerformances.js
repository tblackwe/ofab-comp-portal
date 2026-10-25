import { useEffect, useState } from 'react'

// Loads performances.json (via the Worker) and lists the newest first.
export function usePerformances() {
  const [state, setState] = useState({ status: 'loading', performances: [], error: null })

  useEffect(() => {
    let cancelled = false
    fetch('/api/performances', { headers: { accept: 'application/json' } })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
          return null
        }
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
        return body.performances
      })
      .then((performances) => {
        if (cancelled || !performances) return
        const sorted = [...performances].sort((a, b) => b.date.localeCompare(a.date))
        setState({ status: 'ready', performances: sorted, error: null })
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', performances: [], error: error.message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

import { useEffect, useState } from 'react'
import { fetchLiveMajors } from '../lib/tournamentHistoryApi'

// In-progress and upcoming majors from `live-majors`. Resolves to [] when
// the sweep fails or finds nothing, so callers simply render nothing.
export function useLiveMajors() {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchLiveMajors()
      .then((data) => { if (!cancelled) setEvents(data.events ?? []) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [])
  return events
}

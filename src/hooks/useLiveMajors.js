import { useEffect, useState } from 'react'
import { fetchLiveMajors } from '../lib/tournamentHistoryApi'

// In-progress and upcoming majors from `live-majors`, fetched once `enabled`
// first turns true (the section is collapsed until opened). null until
// loaded; [] when the sweep fails or finds nothing.
export function useLiveMajors(enabled) {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    if (!enabled || events) return
    let cancelled = false
    fetchLiveMajors()
      .then((data) => { if (!cancelled) setEvents(data.events ?? []) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [enabled, events])
  return events
}

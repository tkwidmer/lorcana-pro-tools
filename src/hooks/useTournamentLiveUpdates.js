import { useEffect, useRef, useState } from 'react'
import { subscribeToTournamentLive } from '../lib/tournamentLive'

// Subscribes to Ravensburger's live-update channel for `eventId` and calls
// `onMessage` (debounced, since a batch of backend changes can broadcast
// several messages close together) whenever anything changes, so the
// caller can silently refresh instead of requiring a manual reload.
// `onMessage` is read via a ref so callers can pass a fresh closure every
// render without re-subscribing. Returns the Pusher connection status, or
// null while `eventId` is falsy (nothing to connect to).
export function useTournamentLiveUpdates(eventId, onMessage, debounceMs = 1500) {
  const [status, setStatus] = useState(null)
  const onMessageRef = useRef(onMessage)
  useEffect(() => {
    onMessageRef.current = onMessage
  })

  useEffect(() => {
    if (!eventId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(null)
      return
    }
    let timer = null
    const unsubscribe = subscribeToTournamentLive(eventId, {
      onMessage: () => {
        clearTimeout(timer)
        timer = setTimeout(() => onMessageRef.current?.(), debounceMs)
      },
      onStatusChange: setStatus,
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [eventId, debounceMs])

  return status
}

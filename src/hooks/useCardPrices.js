import { useEffect, useState } from 'react'
import { fetchCardPrices } from '../lib/duelsApi'

// One fetch per page load, shared by every component that asks. A failed
// load is dropped so the next mount retries.
let snapshot = null
function loadSnapshot() {
  if (!snapshot) {
    snapshot = fetchCardPrices()
    snapshot.catch(() => { snapshot = null })
  }
  return snapshot
}

export function useCardPrices() {
  const [state, setState] = useState({ prices: null, updatedAt: null, error: null })
  useEffect(() => {
    let mounted = true
    loadSnapshot().then(
      data => mounted && setState({ prices: data.prices, updatedAt: data.updatedAt, error: null }),
      err => mounted && setState({ prices: null, updatedAt: null, error: err.message }),
    )
    return () => { mounted = false }
  }, [])
  return state
}

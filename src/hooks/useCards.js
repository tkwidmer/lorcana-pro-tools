import { useState, useEffect } from 'react'
import { getCachedCards, setCachedCards } from '../lib/cardsCache'

const CARDS_URL = '/api/cards'
const CACHE_READ_TIMEOUT_MS = 3000

export function useCards() {
  const [data, setData] = useState({ cards: [], sets: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true

    async function loadCards() {
      try {
        // Try cache first — a stuck/corrupted IndexedDB connection can leave
        // this pending forever with no error, so race it against a timeout
        // and fall back to a fresh network fetch rather than hang the page.
        const cached = await Promise.race([
          getCachedCards(),
          new Promise(resolve => setTimeout(() => resolve(null), CACHE_READ_TIMEOUT_MS)),
        ])
        if (cached && mounted) {
          setData(cached)
          setLoading(false)
          return
        }

        const response = await fetch(CARDS_URL)
        if (!response.ok) throw new Error(`Failed to load card data (HTTP ${response.status})`)
        const json = await response.json()
        const fresh = { cards: json.cards, sets: json.sets }

        if (mounted) {
          setData(fresh)
          setLoading(false)
          await setCachedCards(fresh)
        }
      } catch (err) {
        if (mounted) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    loadCards()
    return () => { mounted = false }
  }, [])

  return { cards: data.cards, sets: data.sets, loading, error }
}

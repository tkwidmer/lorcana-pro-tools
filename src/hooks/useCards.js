import { useState, useEffect } from 'react'
import { getCachedCards, setCachedCards } from '../lib/cardsCache'

const CARDS_URL = '/api/cards'

export function useCards() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true

    async function loadCards() {
      try {
        // Try cache first
        const cached = await getCachedCards()
        if (cached && mounted) {
          setCards(cached)
          setLoading(false)
          return
        }

        // Fetch fresh
        const response = await fetch(CARDS_URL)
        if (!response.ok) throw new Error(`Failed to load card data (HTTP ${response.status})`)
        const data = await response.json()
        const cardList = Array.isArray(data) ? data : (data.cards ?? [])

        if (mounted) {
          setCards(cardList)
          setLoading(false)
          await setCachedCards(cardList)
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

  return { cards, loading, error }
}

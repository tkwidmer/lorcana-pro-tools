import { useState, useEffect } from 'react'

const CARDS_URL = 'https://lorcanajson.org/files/current/en/allCards.json'

export function useCards() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(CARDS_URL)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load card data (HTTP ${r.status})`)
        return r.json()
      })
      .then(data => {
        setCards(data.cards ?? [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return { cards, loading, error }
}

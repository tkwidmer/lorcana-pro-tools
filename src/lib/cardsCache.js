import { promisify, getTx } from './db'

const STORE = 'cards'

export async function getCachedCards() {
  try {
    const store = await getTx(STORE, 'readonly')
    const cached = await promisify(store.get('current'))
    if (!cached) return null
    const age = Date.now() - cached.fetchedAt
    const ONE_DAY = 24 * 60 * 60 * 1000
    if (age > ONE_DAY) return null
    return cached.cards
  } catch {
    return null
  }
}

export async function setCachedCards(cards) {
  try {
    const store = await getTx(STORE, 'readwrite')
    await promisify(store.put({
      version: 'current',
      cards,
      fetchedAt: Date.now(),
    }))
  } catch {
    // silently fail if storage is full
  }
}

export async function clearCardsCache() {
  try {
    const store = await getTx(STORE, 'readwrite')
    await promisify(store.delete('current'))
  } catch { /* noop */ }
}

import { promisify, getTx } from './db'

const STORE = 'cards'

export async function getCachedCards() {
  try {
    const store = await getTx(STORE, 'readonly')
    const cached = await promisify(store.get('current'))
    if (!cached?.cards || !cached.sets) return null
    const ONE_DAY = 24 * 60 * 60 * 1000
    if (Date.now() - cached.fetchedAt > ONE_DAY) return null
    return { cards: cached.cards, sets: cached.sets }
  } catch {
    return null
  }
}

export async function setCachedCards({ cards, sets }) {
  try {
    const store = await getTx(STORE, 'readwrite')
    await promisify(store.put({ version: 'current', cards, sets, fetchedAt: Date.now() }))
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

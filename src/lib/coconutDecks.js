import { getTx, promisify } from './db'

const STORE = 'coconutDecks'

export async function saveDeck(deck) {
  if (!deck?.id) return
  const store = await getTx(STORE, 'readwrite')
  const existing = await promisify(store.get(deck.id))
  const record = {
    ...deck,
    createdAt: existing?.createdAt ?? deck.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  }
  await promisify(store.put(record))
  return record
}

export async function getDeck(id) {
  const store = await getTx(STORE, 'readonly')
  return promisify(store.get(id))
}

export async function getAllDecks() {
  const store = await getTx(STORE, 'readonly')
  const all = await promisify(store.getAll())
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteDeck(id) {
  const store = await getTx(STORE, 'readwrite')
  return promisify(store.delete(id))
}

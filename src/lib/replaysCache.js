import { getTx, promisify } from './db'

const STORE = 'replays'

export async function saveReplay(replay) {
  if (!replay || !replay.gameId) return
  const store = await getTx(STORE, 'readwrite')
  await promisify(store.put(replay))
  return replay
}

export async function getReplay(gameId) {
  const store = await getTx(STORE, 'readonly')
  return promisify(store.get(gameId))
}

export async function getAllReplays() {
  const store = await getTx(STORE, 'readonly')
  const all = await promisify(store.getAll())
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export async function deleteReplay(gameId) {
  const store = await getTx(STORE, 'readwrite')
  return promisify(store.delete(gameId))
}

export async function clearAllReplays() {
  const store = await getTx(STORE, 'readwrite')
  return promisify(store.clear())
}

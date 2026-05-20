import { getTx, promisify } from './db'

const STORE = 'games'

export async function saveGame(uuid, game) {
  if (!uuid || !game) return
  const store = await getTx(STORE, 'readwrite')
  const existing = await promisify(store.get(uuid))
  const record = {
    uuid,
    savedAt: existing?.savedAt ?? Date.now(),
    lastUpdated: Date.now(),
    game,
  }
  await promisify(store.put(record))
  return record
}

export async function getGame(uuid) {
  const store = await getTx(STORE, 'readonly')
  return promisify(store.get(uuid))
}

export async function getAllGames() {
  const store = await getTx(STORE, 'readonly')
  const all = await promisify(store.getAll())
  return all.sort((a, b) => b.lastUpdated - a.lastUpdated)
}

export async function deleteGame(uuid) {
  const store = await getTx(STORE, 'readwrite')
  return promisify(store.delete(uuid))
}

export async function clearAllGames() {
  const store = await getTx(STORE, 'readwrite')
  return promisify(store.clear())
}

export function summarizeGame(record) {
  const { uuid, savedAt, lastUpdated, game } = record
  return {
    uuid,
    savedAt,
    lastUpdated,
    p1Name: game.p1Name,
    p2Name: game.p2Name,
    p1InkColors: game.p1InkColors ?? [],
    p2InkColors: game.p2InkColors ?? [],
    winner: game.winner,
    currentTurn: game.currentTurn,
    status: game.status,
    logCount: game.log?.length ?? 0,
  }
}

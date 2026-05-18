const DB_NAME = 'lorcana_pro_tools'
const DB_VERSION = 1
const STORE = 'games'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'uuid' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode) {
  return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE))
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveGame(uuid, game) {
  if (!uuid || !game) return
  const store = await tx('readwrite')
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
  const store = await tx('readonly')
  return promisify(store.get(uuid))
}

export async function getAllGames() {
  const store = await tx('readonly')
  const all = await promisify(store.getAll())
  return all.sort((a, b) => b.lastUpdated - a.lastUpdated)
}

export async function deleteGame(uuid) {
  const store = await tx('readwrite')
  return promisify(store.delete(uuid))
}

export async function clearAllGames() {
  const store = await tx('readwrite')
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

const DB_NAME = 'lorcana_gamelogs'
const DB_VERSION = 1
const STORE = 'gamelogs'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
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

function compressRawLogs(logs) {
  if (!Array.isArray(logs)) return []
  // Keep full raw logs for inspection and debugging
  return logs
}

export async function saveGamelog(id, data, rawLogs) {
  if (!id || !data) return
  const store = await tx('readwrite')
  const existing = await promisify(store.get(id))
  const record = {
    ...data,
    id,
    savedAt: existing?.savedAt ?? Date.now(),
    _rawLogs: rawLogs ? compressRawLogs(rawLogs) : undefined,
  }
  await promisify(store.put(record))
  return record
}

export async function getGamelog(id) {
  const store = await tx('readonly')
  return promisify(store.get(id))
}

export async function getAllGamelogs() {
  const store = await tx('readonly')
  const all = await promisify(store.getAll())
  return all.sort((a, b) => (b.playedAt ?? b.savedAt) - (a.playedAt ?? a.savedAt))
}

export async function deleteGamelog(id) {
  const store = await tx('readwrite')
  return promisify(store.delete(id))
}

export async function clearAllGamelogs() {
  const store = await tx('readwrite')
  return promisify(store.clear())
}

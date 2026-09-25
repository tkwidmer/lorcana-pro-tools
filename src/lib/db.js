const DB_NAME = 'lorcana_pro_tools'
const DB_VERSION = 5

const STORE_KEY_PATHS = {
  games: 'uuid',
  cards: 'version',
  coconutDecks: 'id',
}

let dbPromise = null

export function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // STORE_KEY_PATHS is the whole schema: drop stores that left it
      // (v5 removed the old Meta Drift `metaSnapshots` store).
      for (const store of [...db.objectStoreNames]) {
        if (!(store in STORE_KEY_PATHS)) db.deleteObjectStore(store)
      }
      for (const store of Object.keys(STORE_KEY_PATHS)) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: STORE_KEY_PATHS[store] })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    // Fires when another open connection (e.g. a stale tab) is blocking a
    // version upgrade. Without this, the request never resolves or rejects —
    // callers would hang forever with no error to catch or fall back on.
    req.onblocked = () => reject(new Error('IndexedDB open blocked by another connection'))
  })
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

export function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getTx(storeName, mode) {
  const db = await openDB()
  return db.transaction(storeName, mode).objectStore(storeName)
}

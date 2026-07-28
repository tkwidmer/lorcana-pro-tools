const DB_NAME = 'lorcana_pro_tools'
const DB_VERSION = 3

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
      for (const store of Object.keys(STORE_KEY_PATHS)) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: STORE_KEY_PATHS[store] })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
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

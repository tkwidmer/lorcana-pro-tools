const DB_NAME = 'lorcana_pro_tools'
const DB_VERSION = 2

let dbPromise = null

export function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      const stores = ['games', 'replays', 'cards']
      for (const store of stores) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: store === 'cards' ? 'version' : 'gameId' === store ? 'gameId' : 'uuid' })
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

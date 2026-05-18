/* eslint-disable no-undef */
// Runs on all lorcana-pro-tools pages. Saves every game update to IndexedDB
// and forwards the active games map to the page so GameScraperPage can render
// and toggle between simultaneous games.

const DB_NAME = 'lorcana_pro_tools'
const DB_VERSION = 1
const STORE = 'games'

let db = null
function openDB() {
  if (db) return Promise.resolve(db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'uuid' })
    }
    req.onsuccess = () => { db = req.result; resolve(db) }
    req.onerror = () => reject(req.error)
  })
}

function saveGame(uuid, game) {
  if (!uuid || !game) return
  openDB().then(d => {
    const tx = d.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const getReq = store.get(uuid)
    getReq.onsuccess = () => {
      store.put({ uuid, savedAt: getReq.result?.savedAt ?? Date.now(), lastUpdated: Date.now(), game })
    }
  }).catch(() => {})
}

function forwardGames(games) {
  if (!games || typeof games !== 'object') return
  // Save every game to IndexedDB
  Object.values(games).forEach(({ uuid, game }) => saveGame(uuid, game))
  // Push updated map to the page
  window.postMessage({ type: 'lorcana_active_games', games }, '*')
}

// Push any games already in storage when this page loads
chrome.storage.local.get('lorcana_active_games', (result) => {
  forwardGames(result.lorcana_active_games)
})

// Listen for future updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lorcana_active_games) {
    forwardGames(changes.lorcana_active_games.newValue)
  }
})

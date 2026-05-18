/* eslint-disable no-undef */
// Runs on all lorcana-pro-tools pages. Receives game data from the extension
// background, forwards it to the page (so GameScraperPage can render it), and
// also writes directly to IndexedDB so games are saved regardless of which
// page is currently open.

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
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: 'uuid' })
      }
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
      store.put({
        uuid,
        savedAt: getReq.result?.savedAt ?? Date.now(),
        lastUpdated: Date.now(),
        game,
      })
    }
  }).catch(() => {})
}

function forward(value) {
  if (!value?.game) return
  const { game, uuid } = value

  // Save to IndexedDB on every update, from any page
  if (uuid) saveGame(uuid, game)

  // Also push to the page in case GameScraperPage is open
  window.postMessage({ type: 'lorcana_game_data', game, uuid: uuid ?? null }, '*')
}

// Push any game data already in storage when this page loads
chrome.storage.local.get('lorcana_latest_game', (result) => {
  forward(result.lorcana_latest_game)
})

// Listen for future updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lorcana_latest_game) {
    forward(changes.lorcana_latest_game.newValue)
  }
})

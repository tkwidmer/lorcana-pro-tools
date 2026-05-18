/* eslint-disable no-undef */
// Runs on all lorcana-pro-tools pages. Saves every game update to IndexedDB
// and forwards the active games map to GameScraperPage for live viewing.

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

// Parse what we can from raw WebSocket game data without card lookup.
// GameScraperPage will overwrite this with a richer version (including ink
// colors and observed deck) once card data has loaded.
function parseMinimal(rawGame) {
  const names = rawGame.playerNames ?? {}
  const p1 = rawGame.player1 ?? {}
  const p2 = rawGame.player2 ?? {}
  const logs = rawGame.logs ?? []

  // Build a name map from log cardRefs so field cards have names
  const defIdToName = {}
  for (const log of logs) {
    for (const ref of (log.cardRefs ?? [])) {
      if (ref.id && ref.name) defIdToName[ref.id] = ref.name
    }
  }
  const enrichField = (field) => (field ?? []).map(c => ({
    ...c,
    name: defIdToName[c.definitionId] ?? c.name ?? c.definitionId,
  }))

  return {
    p1Name: names.player1 ?? names['1'] ?? 'Player 1',
    p2Name: names.player2 ?? names['2'] ?? 'Player 2',
    p1Lore: p1.lore ?? null,
    p2Lore: p2.lore ?? null,
    p1Hand: p1.handCount ?? null,
    p2Hand: p2.handCount ?? null,
    p1Deck: p1.deckCount ?? null,
    p2Deck: p2.deckCount ?? null,
    p1Field: enrichField(p1.field),
    p2Field: enrichField(p2.field),
    p1InkColors: [],  // requires card lookup — GameScraperPage fills these in
    p2InkColors: [],
    p1ObservedDeck: [],
    p2ObservedDeck: [],
    p1InkPool: p1.inkCount ?? p1.inkAvailable ?? null,
    p2InkPool: p2.inkCount ?? p2.inkAvailable ?? null,
    currentTurn: rawGame.turnNumber ?? null,
    winner: rawGame.winner ?? null,
    status: rawGame.status ?? null,
    log: logs,
    raw: rawGame,
  }
}

function saveGame(uuid, rawGame) {
  if (!uuid || !rawGame) return
  openDB().then(d => {
    const tx = d.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const getReq = store.get(uuid)
    getReq.onsuccess = () => {
      const existing = getReq.result
      // Don't overwrite a richer record (one with ink colors populated by
      // GameScraperPage's full parse) with our minimal version.
      const existingIsRich = existing?.game?.p1InkColors?.length > 0
      if (existingIsRich) return

      store.put({
        uuid,
        savedAt: existing?.savedAt ?? Date.now(),
        lastUpdated: Date.now(),
        game: parseMinimal(rawGame),
      })
    }
  }).catch(() => {})
}

function forwardGames(games) {
  if (!games || typeof games !== 'object') return
  Object.values(games).forEach(({ uuid, game }) => saveGame(uuid, game))
  window.postMessage({ type: 'lorcana_active_games', games }, '*')
}

chrome.storage.local.get('lorcana_active_games', (result) => {
  forwardGames(result.lorcana_active_games)
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lorcana_active_games) {
    forwardGames(changes.lorcana_active_games.newValue)
  }
})

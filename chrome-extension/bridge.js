/* eslint-disable no-undef */
// Runs on all lorcana-pro-tools pages. Saves every game update to IndexedDB
// and forwards the active games map to GameScraperPage for live viewing.

// --- IndexedDB ---

const DB_NAME = 'lorcana_pro_tools'
const DB_VERSION = 2
const STORE = 'games'

let db = null
function openDB() {
  if (db) return Promise.resolve(db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      const stores = ['games', 'cards']
      for (const store of stores) {
        if (!d.objectStoreNames.contains(store)) {
          const keyPath = store === 'cards' ? 'version' : 'uuid'
          d.createObjectStore(store, { keyPath })
        }
      }
    }
    req.onsuccess = () => { db = req.result; resolve(db) }
    req.onerror = () => reject(req.error)
  })
}

function dbSave(uuid, game) {
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

// --- Card lookup (fetched once, cached in extension storage) ---

const INK_NAME_MAP = {
  red: 'ruby', ruby: 'ruby',
  blue: 'sapphire', sapphire: 'sapphire',
  green: 'emerald', emerald: 'emerald',
  yellow: 'amber', amber: 'amber',
  purple: 'amethyst', amethyst: 'amethyst',
  gray: 'steel', grey: 'steel', steel: 'steel',
}

function resolveInkName(color) {
  return color ? (INK_NAME_MAP[color.toLowerCase()] ?? null) : null
}

let cardLookup = null

async function getCardLookup() {
  if (cardLookup) return cardLookup

  // Try extension storage cache first (24-hour TTL)
  const cached = await new Promise(resolve => chrome.storage.local.get(['lorcana_card_lookup', 'lorcana_card_lookup_ts'], resolve))
  const age = Date.now() - (cached.lorcana_card_lookup_ts ?? 0)
  if (cached.lorcana_card_lookup?.byId && Object.keys(cached.lorcana_card_lookup.byId).length > 0 && age < 86_400_000) {
    cardLookup = cached.lorcana_card_lookup
    return cardLookup
  }

  // Fetch from same-origin API
  try {
    const res = await fetch('/api/cards')
    if (!res.ok) return { byId: {}, byName: {} }
    const data = await res.json()
    const cards = data.cards ?? []

    // When LorcanaJSON has multiple entries with the same setCode-number (e.g. promo reprints),
    // prefer non-promo cards, then Core > Infinity > other format cards, then higher set number on ties.
    const score = c => {
      const promoBonus = (c.promoGrouping == null && c.promoSourceCategory == null) ? 10 : 0
      if (c.allowedInFormats?.Core?.allowed) return promoBonus + 2
      if (c.allowedInFormats?.Infinity?.allowed) return promoBonus + 1
      return promoBonus
    }
    const cardById = {}
    for (const c of cards) {
      if (c.setCode == null || c.number == null) continue
      const key = `${c.setCode}-${c.number}`
      const existing = cardById[key]
      if (!existing) { cardById[key] = c; continue }
      const ts = score(c), es = score(existing)
      if (ts > es) { cardById[key] = c; continue }
      if (ts === es && (parseInt(c.setCode) || 0) > (parseInt(existing.setCode) || 0)) cardById[key] = c
    }

    const byId = {}
    for (const [key, c] of Object.entries(cardById)) {
      byId[key] = { color: c.color, name: c.name, fullName: c.fullName }
    }

    const byName = {}
    for (const card of cards) {
      const entry = { color: card.color, name: card.name, fullName: card.fullName }
      if (card.fullName) byName[card.fullName] = entry
      if (card.name) byName[card.name] = entry
    }

    const lookup = { byId, byName }
    cardLookup = lookup
    chrome.storage.local.set({ lorcana_card_lookup: lookup, lorcana_card_lookup_ts: Date.now() })
    return lookup
  } catch {
    return { byId: {}, byName: {} }
  }
}

// --- Game parsing (mirrors parseLiveGame / buildObservedDeck in GameScraperPage) ---

function buildObservedDeck(logs, fieldCards, playerNum, lookup = {}) {
  const byName = lookup.byName ?? {}
  const RELEVANT = new Set(['CARD_PLAYED', 'CARD_INKED', 'CARD_DISCARDED', 'CARD_DRAWN'])
  const cards = {}
  const colors = new Set()

  for (const log of logs) {
    if (log.player !== playerNum && log.player !== String(playerNum)) continue
    if (!RELEVANT.has(log.type)) continue
    for (const ref of (log.cardRefs ?? [])) {
      if (!ref.id || !ref.name) continue
      if (!cards[ref.id]) cards[ref.id] = { name: ref.name, plays: 0, inked: 0, discarded: 0 }
      if (log.type === 'CARD_PLAYED') cards[ref.id].plays++
      else if (log.type === 'CARD_INKED') cards[ref.id].inked++
      else if (log.type === 'CARD_DISCARDED') cards[ref.id].discarded++
      const ink = resolveInkName(byName[ref.name]?.color)
      if (ink) colors.add(ink)
    }
  }

  for (const card of fieldCards) {
    if (!card.definitionId) continue
    if (!cards[card.definitionId]) cards[card.definitionId] = { name: card.name ?? card.definitionId, plays: 0, inked: 0, discarded: 0 }
    const ink = resolveInkName((byName[card.fullName] ?? byName[card.name])?.color)
    if (ink) colors.add(ink)
  }

  const cardList = Object.entries(cards)
    .map(([definitionId, { name, plays, inked, discarded }]) => ({
      definitionId, name, plays: Math.max(plays, 1), inked, discarded,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { cards: cardList, colors: Array.from(colors).sort() }
}

function parseGame(rawGame, lookup = {}) {
  const names = rawGame.playerNames ?? {}
  const p1 = rawGame.player1 ?? {}
  const p2 = rawGame.player2 ?? {}
  const logs = rawGame.logs ?? []

  const defIdToName = {}
  const defIdToFullName = {}
  for (const log of logs) {
    for (const ref of (log.cardRefs ?? [])) {
      if (ref.id && ref.name) {
        defIdToName[ref.id] = ref.name
        defIdToFullName[ref.id] = ref.fullName ?? ref.name
      }
    }
  }
  for (const [id, card] of Object.entries(lookup.byId ?? {})) {
    if (card.name && !defIdToName[id]) defIdToName[id] = card.name
    if (!defIdToFullName[id]) defIdToFullName[id] = card.fullName ?? card.name
  }

  const enrichField = (field) => (field ?? []).map(c => ({
    ...c,
    name: defIdToName[c.definitionId] ?? c.name ?? c.definitionId,
    fullName: defIdToFullName[c.definitionId] ?? c.fullName ?? c.name ?? c.definitionId,
  }))

  const p1Field = enrichField(p1.field)
  const p2Field = enrichField(p2.field)
  const p1Obs = buildObservedDeck(logs, p1Field, 1, lookup)
  const p2Obs = buildObservedDeck(logs, p2Field, 2, lookup)

  const countInked = (n) => logs.filter(l => (l.player === n || l.player === String(n)) && l.type === 'CARD_INKED').length
  const p1InkedCount = countInked(1)
  const p2InkedCount = countInked(2)

  return {
    p1Name: names.player1 ?? names['1'] ?? 'Player 1',
    p2Name: names.player2 ?? names['2'] ?? 'Player 2',
    p1Lore: p1.lore ?? null,
    p2Lore: p2.lore ?? null,
    p1Hand: p1.handCount ?? null,
    p2Hand: p2.handCount ?? null,
    p1Deck: p1.deckCount ?? null,
    p2Deck: p2.deckCount ?? null,
    p1Field,
    p2Field,
    p1InkColors: p1Obs.colors,
    p2InkColors: p2Obs.colors,
    p1ObservedDeck: p1Obs.cards,
    p2ObservedDeck: p2Obs.cards,
    p1InkPool: p1.inkCount ?? p1.inkAvailable ?? (p1InkedCount > 0 ? p1InkedCount : null),
    p2InkPool: p2.inkCount ?? p2.inkAvailable ?? (p2InkedCount > 0 ? p2InkedCount : null),
    p1InkUsed: p1.inkUsed ?? p1.inkSpent ?? null,
    p2InkUsed: p2.inkUsed ?? p2.inkSpent ?? null,
    p1InkedCount,
    p2InkedCount,
    currentTurn: rawGame.turnNumber ?? null,
    activePlayer: rawGame.currentPlayer ?? rawGame.timerView?.activePlayer ?? null,
    winner: rawGame.winner ?? null,
    status: rawGame.status ?? null,
    log: logs,
    raw: rawGame,
  }
}

// --- Main forwarding logic ---

async function forwardGames(games) {
  if (!games || typeof games !== 'object') return

  const lookup = await getCardLookup()

  Object.values(games).forEach(({ uuid, game, meta }) => {
    const parsed = parseGame(game, lookup)
    dbSave(uuid, parsed)
    if (meta) games[uuid] = { ...games[uuid], meta }
  })

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

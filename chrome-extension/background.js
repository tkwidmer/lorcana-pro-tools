/* eslint-disable no-undef */

const ACTIVE_GAMES_KEY = 'lorcana_active_games'
const MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours
const MAX_RAW_HISTORY = 20 // full incoming logs are stored per entry, so keep this modest

function extractUuid(url) {
  const match = (url ?? '').match(/spectate\/([a-f0-9-]+)/i)
  return match ? match[1] : null
}

// spectator_update payloads only include a recent window of log entries, not the
// full game history. Merge by finding where the new window overlaps the tail of
// what we've already accumulated, so the observed-cards list grows across turns
// instead of resetting each update.
function mergeLogs(prevLogs, newLogs) {
  if (!prevLogs.length) return newLogs
  if (!newLogs.length) return prevLogs
  const maxOverlap = Math.min(prevLogs.length, newLogs.length)
  for (let k = maxOverlap; k > 0; k--) {
    if (JSON.stringify(prevLogs.slice(-k)) === JSON.stringify(newLogs.slice(0, k))) {
      return [...prevLogs, ...newLogs.slice(k)]
    }
  }
  return [...prevLogs, ...newLogs]
}

function getStoredGames() {
  return new Promise((resolve) => {
    chrome.storage.local.get(ACTIVE_GAMES_KEY, (result) => resolve(result[ACTIVE_GAMES_KEY] ?? {}))
  })
}

function setStoredGames(games) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [ACTIVE_GAMES_KEY]: games }, resolve)
  })
}

// spectator_update messages can arrive in rapid bursts (especially during game
// setup, when many log entries land within milliseconds of each other). Each
// update does an async get-then-set against chrome.storage.local; without
// serialization, overlapping updates read the same stale snapshot and the
// later write clobbers the earlier one's merged logs, silently dropping
// previously-accumulated log entries (and the cards/actions derived from them).
// Chain all updates through this promise so each one sees the previous one's
// result.
let updateQueue = Promise.resolve()

chrome.runtime.onMessage.addListener((request) => {
  if (request.type !== 'GAME_DATA') return

  const payload = request.payload
  if (payload?.type !== 'spectator_update' || !payload?.game) return

  const uuid = extractUuid(request.url)
  if (!uuid) return

  updateQueue = updateQueue
    .then(async () => {
      const games = await getStoredGames()

      // Prune stale games older than 2 hours
      const now = Date.now()
      Object.keys(games).forEach(id => {
        if (now - games[id].timestamp > MAX_AGE_MS) delete games[id]
      })

      // Store full payload so callers can inspect top-level fields (e.g. mmr, rating).
      // Merge with previous meta so any field that ever appeared is retained.
      const { game, ...rest } = payload
      const prevMeta = games[uuid]?.meta ?? {}
      const incomingLogs = game.logs ?? []
      const prevLogs = games[uuid]?.game?.logs ?? []
      const mergedLogs = mergeLogs(prevLogs, incomingLogs)

      // Debug trail: one entry per spectator_update, so the raw payload
      // inspector can show exactly what window of logs arrived on each
      // message (e.g. to check whether a reconnect resets to a later turn).
      const logSummary = (l) => l ? { type: l.type, turn: l.turnNumber, player: l.player } : null
      const rawEntry = {
        timestamp: now,
        incomingCount: incomingLogs.length,
        prevCount: prevLogs.length,
        mergedCount: mergedLogs.length,
        firstIncoming: logSummary(incomingLogs[0]),
        lastIncoming: logSummary(incomingLogs[incomingLogs.length - 1]),
        incomingLogs,
      }
      const rawMessages = [...(games[uuid]?.rawMessages ?? []), rawEntry].slice(-MAX_RAW_HISTORY)

      games[uuid] = { game: { ...game, logs: mergedLogs }, meta: { ...prevMeta, ...rest }, uuid, timestamp: now, rawMessages }
      await setStoredGames(games)
    })
    .catch((err) => console.error('[Lorcana] Failed to process game update:', err))
})

// Experimental: results of probing duels.ink REST endpoints for full game
// history (see relay.js). Stored alongside the game so the raw payload
// inspector can show what each candidate endpoint returned.
chrome.runtime.onMessage.addListener((request) => {
  if (request.type !== 'GAME_BACKFILL_DEBUG') return

  const uuid = extractUuid(request.url)
  if (!uuid) return

  updateQueue = updateQueue
    .then(async () => {
      const games = await getStoredGames()
      if (!games[uuid]) {
        games[uuid] = { game: { logs: [] }, meta: {}, uuid, timestamp: Date.now() }
      }
      games[uuid].backfillDebug = request.payload
      await setStoredGames(games)
    })
    .catch((err) => console.error('[Lorcana] Failed to process backfill debug:', err))
})

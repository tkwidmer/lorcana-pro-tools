/* eslint-disable no-undef */

const ACTIVE_GAMES_KEY = 'lorcana_active_games'
const MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours

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

chrome.runtime.onMessage.addListener((request) => {
  if (request.type !== 'GAME_DATA') return

  const payload = request.payload
  if (payload?.type !== 'spectator_update' || !payload?.game) return

  const uuid = extractUuid(request.url)
  if (!uuid) return

  chrome.storage.local.get(ACTIVE_GAMES_KEY, (result) => {
    const games = result[ACTIVE_GAMES_KEY] ?? {}

    // Prune stale games older than 2 hours
    const now = Date.now()
    Object.keys(games).forEach(id => {
      if (now - games[id].timestamp > MAX_AGE_MS) delete games[id]
    })

    // Store full payload so callers can inspect top-level fields (e.g. mmr, rating).
    // Merge with previous meta so any field that ever appeared is retained.
    const { game, ...rest } = payload
    const prevMeta = games[uuid]?.meta ?? {}
    const mergedLogs = mergeLogs(games[uuid]?.game?.logs ?? [], game.logs ?? [])
    games[uuid] = { game: { ...game, logs: mergedLogs }, meta: { ...prevMeta, ...rest }, uuid, timestamp: now }
    chrome.storage.local.set({ [ACTIVE_GAMES_KEY]: games })
  })
})

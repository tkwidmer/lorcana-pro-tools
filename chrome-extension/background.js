/* eslint-disable no-undef */

const ACTIVE_GAMES_KEY = 'lorcana_active_games'
const MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours

function extractUuid(url) {
  const match = (url ?? '').match(/spectate\/([a-f0-9-]+)/i)
  return match ? match[1] : null
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
    games[uuid] = { game, meta: { ...prevMeta, ...rest }, uuid, timestamp: now }
    chrome.storage.local.set({ [ACTIVE_GAMES_KEY]: games })
  })
})

/* eslint-disable no-undef */

function extractUuid(url) {
  const match = (url ?? '').match(/spectate\/([a-f0-9-]+)/i)
  return match ? match[1] : null
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.type !== 'GAME_DATA') return

  const payload = request.payload
  if (payload?.type !== 'spectator_update' || !payload?.game) return

  const uuid = extractUuid(request.url)

  // Write to storage — bridge.js listens via chrome.storage.onChanged,
  // which fires reliably without any tab messaging timing issues.
  chrome.storage.local.set({
    lorcana_latest_game: {
      game: payload.game,
      uuid,
      timestamp: Date.now(),
    },
  })
})

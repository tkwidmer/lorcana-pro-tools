/* eslint-disable no-undef */

const APP_ORIGINS = [
  'https://lorcana-pro-tools.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

// Extract game UUID from a duels.ink spectate URL
function extractUuid(url) {
  const match = (url ?? '').match(/spectate\/([a-f0-9-]+)/i)
  return match ? match[1] : null
}

// Listen for game data from the duels.ink content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== 'GAME_DATA') return

  const uuid = extractUuid(request.url)
  const payload = request.payload

  // Forward to all open lorcana-pro-tools tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (!tab.url) return
      const isAppTab = APP_ORIGINS.some(origin => tab.url.startsWith(origin))
      if (!isAppTab) return

      chrome.tabs.sendMessage(tab.id, {
        type: 'GAME_DATA',
        payload,
        uuid,
        url: request.url,
      }).catch(() => {
        // Tab may not have bridge.js loaded yet
      })
    })
  })

  sendResponse({ success: true })
})

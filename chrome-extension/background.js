/* eslint-disable no-undef */
const GAME_DATA_STORE_KEY = 'lorcana_pending_games'

// Listen for game data from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GAME_DATA') {
    // Store messages in local storage for the app to pick up
    chrome.storage.local.get(GAME_DATA_STORE_KEY, (result) => {
      const games = result[GAME_DATA_STORE_KEY] || {}
      const gameId = request.payload.gameId || 'unknown'

      if (!games[gameId]) {
        games[gameId] = {
          messages: [],
          lastUpdate: Date.now(),
          sourceTab: sender.tab.id,
          sourceUrl: request.url
        }
      }

      games[gameId].messages.push({
        data: request.payload,
        timestamp: request.timestamp
      })
      games[gameId].lastUpdate = Date.now()

      chrome.storage.local.set({ [GAME_DATA_STORE_KEY]: games })
    })

    // Notify all tabs that new data is available
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'GAME_DATA_AVAILABLE'
        }).catch(() => {
          // Tab may not have content script
        })
      })
    })

    sendResponse({ success: true })
  }
})

// Clean up old games after 1 hour of inactivity
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000)
  chrome.storage.local.get(GAME_DATA_STORE_KEY, (result) => {
    const games = result[GAME_DATA_STORE_KEY] || {}
    let modified = false

    Object.keys(games).forEach(gameId => {
      if (games[gameId].lastUpdate < oneHourAgo) {
        delete games[gameId]
        modified = true
      }
    })

    if (modified) {
      chrome.storage.local.set({ [GAME_DATA_STORE_KEY]: games })
    }
  })
}, 5 * 60 * 1000) // Check every 5 minutes

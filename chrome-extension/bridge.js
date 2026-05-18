/* eslint-disable no-undef */
// Bridge content script — runs on the lorcana-pro-tools site
// Receives game data from the background service worker and forwards it
// to the page via window.postMessage so GameScraperPage can pick it up.

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'GAME_DATA') {
    const payload = request.payload
    // Only forward spectator_update messages that contain game state
    if (payload?.type === 'spectator_update' && payload?.game) {
      window.postMessage({
        type: 'lorcana_game_data',
        game: payload.game,
        uuid: request.uuid ?? null,
      }, '*')
    }
  }
})

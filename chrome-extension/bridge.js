/* eslint-disable no-undef */
// Runs on lorcana-pro-tools pages. Forwards game data from the extension
// to the page via window.postMessage.

function forward(value) {
  if (!value?.game) return
  window.postMessage({
    type: 'lorcana_game_data',
    game: value.game,
    uuid: value.uuid ?? null,
  }, '*')
}

// On page load, immediately push any game data that's already in storage.
// This handles the case where the spectate page was opened before this page.
chrome.storage.local.get('lorcana_latest_game', (result) => {
  forward(result.lorcana_latest_game)
})

// Also listen for future updates while the page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lorcana_latest_game) {
    forward(changes.lorcana_latest_game.newValue)
  }
})

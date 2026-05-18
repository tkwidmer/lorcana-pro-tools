/* eslint-disable no-undef */
// Runs on lorcana-pro-tools pages. Listens for storage changes written by the
// background service worker and forwards them to the page via postMessage.

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.lorcana_latest_game) return

  const { newValue } = changes.lorcana_latest_game
  if (!newValue?.game) return

  window.postMessage({
    type: 'lorcana_game_data',
    game: newValue.game,
    uuid: newValue.uuid ?? null,
  }, '*')
})

/* eslint-disable no-undef */
// Runs in the ISOLATED world — receives window.postMessage from patch.js
// (which runs in MAIN world) and forwards to the background service worker.

window.addEventListener('message', (e) => {
  if (e.source !== window) return
  if (e.data?.type !== 'LORCANA_WS_DATA') return

  chrome.runtime.sendMessage({
    type: 'GAME_DATA',
    payload: e.data.data,
    url: window.location.href,
    timestamp: Date.now(),
  }).catch(() => {
    // Service worker may be starting up
  })
})

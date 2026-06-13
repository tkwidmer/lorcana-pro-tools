/* eslint-disable no-undef */
// Runs in the ISOLATED world — receives window.postMessage from patch.js
// (which runs in MAIN world) and forwards to the background service worker.
// Retries once if the service worker is starting up.

window.addEventListener('message', (e) => {
  if (e.source !== window) return
  if (e.data?.type !== 'LORCANA_WS_DATA') return

  const msg = {
    type: 'GAME_DATA',
    payload: e.data.data,
    url: window.location.href,
    timestamp: Date.now(),
  }

  chrome.runtime.sendMessage(msg).catch(() => {
    // Service worker may have been idle — give it 500ms to wake up then retry
    setTimeout(() => {
      chrome.runtime.sendMessage(msg).catch(() => {})
    }, 500)
  })
})

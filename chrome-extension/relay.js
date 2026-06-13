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

// --- Experimental: probe for a REST endpoint that returns full game history ---
// The spectator WebSocket only streams events from the moment of connection
// onward, so joining mid-game means earlier turns are never seen. If duels.ink
// exposes a same-origin REST endpoint with the full log history, a content
// script fetch here would carry the user's session cookies automatically
// (unlike a cross-origin call from our Vercel API). This just probes a few
// guessed endpoints and reports back what comes back so we can see whether
// any of them is useful.
;(function probeBackfillEndpoints() {
  const match = window.location.href.match(/spectate\/([a-f0-9-]+)/i)
  if (!match) return
  const uuid = match[1]

  const candidates = [
    `/api/spectate/${uuid}`,
    `/api/game/${uuid}`,
    `/api/games/${uuid}`,
  ]

  Promise.all(candidates.map(async (path) => {
    try {
      const res = await fetch(`https://duels.ink${path}`, { credentials: 'include' })
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const data = await res.json()
        const logs = data?.logs ?? data?.game?.logs ?? null
        return {
          path,
          status: res.status,
          contentType,
          topLevelKeys: data && typeof data === 'object' ? Object.keys(data) : [],
          logsLength: Array.isArray(logs) ? logs.length : null,
          firstLog: Array.isArray(logs) ? logs[0] : null,
          lastLog: Array.isArray(logs) ? logs[logs.length - 1] : null,
        }
      }
      const text = await res.text()
      return { path, status: res.status, contentType, textSample: text.slice(0, 300) }
    } catch (e) {
      return { path, error: String(e) }
    }
  })).then((results) => {
    chrome.runtime.sendMessage({
      type: 'GAME_BACKFILL_DEBUG',
      payload: results,
      url: window.location.href,
      timestamp: Date.now(),
    }).catch(() => {})
  })
})()

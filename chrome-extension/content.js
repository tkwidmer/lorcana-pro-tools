/* eslint-disable no-undef */
// Inject script into page context to patch WebSocket before it's used
const script = document.createElement('script')
script.textContent = `
(function() {
  const originalWebSocket = window.WebSocket
  const interceptedMessages = []

  window.WebSocket = function(...args) {
    const ws = new originalWebSocket(...args)
    const originalAddEventListener = ws.addEventListener

    ws.addEventListener = function(event, handler) {
      if (event === 'message') {
        originalAddEventListener.call(ws, event, (e) => {
          try {
            const data = JSON.parse(e.data)
            window.postMessage({
              type: 'LORCANA_WS_DATA',
              data: data
            }, '*')
          } catch (err) {
            // Ignore non-JSON messages
          }
          handler(e)
        })
      } else {
        originalAddEventListener.call(ws, event, handler)
      }
    }
    return ws
  }
})()
`
document.documentElement.appendChild(script)
script.remove()

// Listen for messages from page context and forward to background script
window.addEventListener('message', (e) => {
  if (e.source !== window) return
  if (e.data.type === 'LORCANA_WS_DATA') {
    chrome.runtime.sendMessage({
      type: 'GAME_DATA',
      payload: e.data.data,
      url: window.location.href,
      timestamp: Date.now()
    }).catch(() => {
      // Extension may not be ready yet
    })
  }
})

// Signal to page that extension is ready
window.postMessage({
  type: 'LORCANA_EXTENSION_READY'
}, '*')

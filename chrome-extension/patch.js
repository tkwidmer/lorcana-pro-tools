/* eslint-disable no-undef */
// Runs in the page's MAIN world at document_start — patches WebSocket before any
// app code runs. Mirrors both the onmessage setter and addEventListener paths.

;(function () {
  const OrigWebSocket = window.WebSocket

  function intercept(ev) {
    try {
      const data = JSON.parse(ev.data)
      window.postMessage({ type: 'LORCANA_WS_DATA', data }, '*')
    } catch (_) {
      // not JSON
    }
  }

  // Patch prototype-level onmessage setter so it's caught regardless of when
  // the app assigns it
  const origDesc = Object.getOwnPropertyDescriptor(OrigWebSocket.prototype, 'onmessage')
  Object.defineProperty(OrigWebSocket.prototype, 'onmessage', {
    set(handler) {
      origDesc.set.call(this, function (ev) {
        intercept(ev)
        if (handler) handler.call(this, ev)
      })
    },
    get() {
      return origDesc.get.call(this)
    },
    configurable: true,
  })

  // Patch addEventListener at the prototype level
  const origAEL = OrigWebSocket.prototype.addEventListener
  OrigWebSocket.prototype.addEventListener = function (type, listener, ...rest) {
    if (type === 'message') {
      return origAEL.call(this, type, function (ev) {
        intercept(ev)
        listener.call(this, ev)
      }, ...rest)
    }
    return origAEL.call(this, type, listener, ...rest)
  }
})()

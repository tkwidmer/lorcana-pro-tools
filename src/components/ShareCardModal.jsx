import { useEffect, useState } from 'react'
import {
  downloadShareImage,
  copyShareImageToClipboard,
  canNativeShareImage,
  nativeShareImage,
} from '../lib/tournamentShareImage'

// Modal for sharing a canvas-rendered image (tournament result card, Coconut
// deck card, etc.) via native share / clipboard copy / download.
export function ShareCardModal({ shareCard, onClose, title = 'Share card', altText = 'Share card', shareTitle = title, maxWidthClass = 'sm:max-w-lg' }) {
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false)
  const [status, setStatus] = useState(null) // null | 'copying' | 'copied' | 'error' | 'sharing'

  useEffect(() => {
    let cancelled = false
    canNativeShareImage().then((ok) => { if (!cancelled) setNativeShareAvailable(ok) })
    return () => { cancelled = true }
  }, [])

  function flash(next) {
    setStatus(next)
    setTimeout(() => setStatus(null), 2500)
  }

  async function handleNativeShare() {
    setStatus('sharing')
    try {
      await nativeShareImage(shareCard.canvas, shareCard.filename, shareTitle)
      setStatus(null)
    } catch (e) {
      if (e?.name !== 'AbortError') flash('error')
      else setStatus(null)
    }
  }

  async function handleCopy() {
    setStatus('copying')
    try {
      await copyShareImageToClipboard(shareCard.canvas)
      flash('copied')
    } catch {
      flash('error')
    }
  }

  async function handleDownload() {
    await downloadShareImage(shareCard.canvas, shareCard.filename)
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white w-full ${maxWidthClass} rounded-t-2xl sm:rounded-xl border border-gray-200 max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>
        <div className="overflow-y-auto p-4">
          <img src={shareCard.imageUrl} alt={altText} className="w-full rounded-lg border border-gray-200" />
        </div>
        <div className="px-4 py-3 border-t border-gray-200 shrink-0 flex flex-wrap gap-2 justify-end">
          {nativeShareAvailable && (
            <button
              onClick={handleNativeShare}
              disabled={status === 'sharing'}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {status === 'sharing' ? 'Sharing…' : 'Share…'}
            </button>
          )}
          <button
            onClick={handleCopy}
            disabled={status === 'copying'}
            className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {status === 'copying' ? 'Copying…' : status === 'copied' ? '✓ Copied' : status === 'error' ? 'Failed' : 'Copy Image'}
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Download JPG
          </button>
        </div>
      </div>
    </div>
  )
}

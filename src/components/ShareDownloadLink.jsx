import { useState } from 'react'
import { downloadShareImage, frameForVideo, videoFilename } from '../lib/tournamentShareImage'

// "Download Social Media Share": `render()` resolves to a canvas, saved as a PNG.
export function ShareDownloadLink({ render, filename }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function download(video) {
    setBusy(true)
    setError(null)
    try {
      const canvas = await render()
      if (video) await downloadShareImage(frameForVideo(canvas), videoFilename(filename), 'image/png')
      else await downloadShareImage(canvas, filename, 'image/png')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <p className="text-sm">
      <button type="button" onClick={() => download(false)} disabled={busy} className="text-forge-ink font-semibold underline decoration-dotted hover:decoration-solid disabled:opacity-50">
        {busy ? 'Rendering…' : 'Download Social Media Share'}
      </button>
      <span className="text-gray-400"> · </span>
      <button type="button" onClick={() => download(true)} disabled={busy} className="text-forge-ink font-semibold underline decoration-dotted hover:decoration-solid disabled:opacity-50">
        16:9 for Video
      </button>
      {error && <span className="ml-2 text-red-600">{error}</span>}
    </p>
  )
}

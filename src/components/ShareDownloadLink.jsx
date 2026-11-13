import { useState } from 'react'
import { downloadShareImage, videoFilename } from '../lib/tournamentShareImage'

// "Download Social Media Share" and "16:9 for Video": `render(video)` resolves
// to a canvas laid out for that use, saved as a PNG.
export function ShareDownloadLink({ render, filename }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function download(video) {
    setBusy(true)
    setError(null)
    try {
      if (video) await downloadShareImage(await render(true), videoFilename(filename), 'image/png')
      else await downloadShareImage(await render(false), filename, 'image/png')
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

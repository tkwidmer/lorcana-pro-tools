import { useState } from 'react'
import { downloadShareImage } from '../lib/tournamentShareImage'

// "Download Social Media Share": `render()` resolves to a canvas, saved as a PNG.
export function ShareDownloadLink({ render, filename }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function download() {
    setBusy(true)
    setError(null)
    try {
      await downloadShareImage(await render(), filename, 'image/png')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <p className="text-sm">
      <button type="button" onClick={download} disabled={busy} className="text-forge-ink font-semibold underline decoration-dotted hover:decoration-solid disabled:opacity-50">
        {busy ? 'Rendering…' : 'Download Social Media Share'}
      </button>
      {error && <span className="ml-2 text-red-600">{error}</span>}
    </p>
  )
}

import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { parseSnapshot } from '../lib/gameSnapshot'
import { saveGame } from '../lib/gameHistory'
import { GameView } from '../components/GameView'

export function SharedGamePage() {
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef(null)

  const loadText = (text) => {
    setError(null)
    setSaved(false)
    try {
      setSnapshot(parseSnapshot(text))
    } catch (e) {
      setSnapshot(null)
      setError(e.message)
    }
  }

  const handleFile = (file) => {
    if (!file) return
    file.text().then(loadText).catch(e => setError(e.message))
  }

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text')
    if (text) {
      e.preventDefault()
      loadText(text)
    }
  }

  const handleSave = () => {
    if (!snapshot) return
    const uuid = snapshot.uuid ?? `imported-${Date.now()}`
    saveGame(uuid, snapshot.game).then(() => setSaved(true))
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Shared Game</h1>
        <p className="text-sm text-gray-500 mt-1">
          Drop in a game snapshot JSON file (exported from any Game Scraper) to view it.
        </p>
      </div>

      {!snapshot && (
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-500 transition-colors"
          onDragOver={(e) => { e.preventDefault() }}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
        >
          <div className="text-sm text-gray-600 mb-4">
            Drop a <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">.json</code> snapshot here,
            or paste JSON below.
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            Choose file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => handleFile(e.target.files[0])}
            className="hidden"
          />
          <div className="mt-6">
            <textarea
              placeholder="Or paste JSON here…"
              onPaste={handlePaste}
              onChange={(e) => e.target.value && loadText(e.target.value)}
              className="w-full h-32 text-xs font-mono border border-gray-200 rounded p-2 focus:outline-none focus:border-gray-500"
            />
          </div>
          {error && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
              {error}
            </div>
          )}
        </div>
      )}

      {snapshot && (
        <>
          <div className="flex items-center gap-3 mb-4 text-sm">
            <span className="text-gray-500">Imported snapshot</span>
            {snapshot.exportedAt && (
              <span className="text-gray-400 text-xs">
                exported {new Date(snapshot.exportedAt).toLocaleString()}
              </span>
            )}
            <button
              onClick={() => { setSnapshot(null); setSaved(false) }}
              className="text-xs text-gray-500 hover:text-gray-900 underline ml-auto"
            >
              Load different file
            </button>
            <button
              onClick={handleSave}
              disabled={saved}
              className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700 disabled:bg-gray-400"
            >
              {saved ? 'Saved' : 'Save to my history'}
            </button>
            {saved && snapshot.uuid && (
              <Link
                to={`/game-history/${snapshot.uuid}`}
                className="text-xs text-blue-600 hover:underline"
              >
                View in history →
              </Link>
            )}
          </div>
          <GameView
            game={snapshot.game}
            lastUpdated={snapshot.exportedAt ? new Date(snapshot.exportedAt) : null}
            uuid={snapshot.uuid}
          />
        </>
      )}
    </div>
  )
}

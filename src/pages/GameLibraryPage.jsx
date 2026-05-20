import { useState, useEffect, useCallback } from 'react'
import { getAllGamelogs, deleteGamelog } from '../lib/gamelogHistory'
import { importGamesFromZip, importGamelogFile } from '../lib/gameImport'
import { analyzeOpponentMetagame } from '../lib/metagameAnalysis'
import { InkImg } from './GamelogAnalyzerPage'

const IMPORTED_GAMES_KEY = 'lorcana_imported_game_ids'

function getImportedGameIds() {
  const stored = localStorage.getItem(IMPORTED_GAMES_KEY)
  return stored ? new Set(JSON.parse(stored)) : new Set()
}

function saveImportedGameIds(ids) {
  localStorage.setItem(IMPORTED_GAMES_KEY, JSON.stringify(Array.from(ids)))
}

export function GameLibraryPage() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [importedIds, setImportedIds] = useState(getImportedGameIds())
  const [importedOpen, setImportedOpen] = useState(true)
  const [personalOpen, setPersonalOpen] = useState(true)
  const [metagameOpen, setMetagameOpen] = useState(true)

  useEffect(() => {
    loadGames()
  }, [])

  async function loadGames() {
    const allGames = await getAllGamelogs()
    setGames(allGames)
  }

  async function processZipFile(file) {
    setLoading(true)
    setError(null)
    try {
      const { importedGames, errors } = await importGamesFromZip(file)
      if (importedGames.length > 0) {
        const newIds = new Set(importedIds)
        importedGames.forEach(g => newIds.add(g.id))
        setImportedIds(newIds)
        saveImportedGameIds(newIds)
        await loadGames()
      }
      if (errors.length > 0) {
        setError(`Imported ${importedGames.length} games, but ${errors.length} files failed`)
      } else if (importedGames.length > 0) {
        setError(null)
      }
    } catch (e) {
      setError(`Failed to import zip: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function processGamelogFile(arrayBuffer, filename) {
    setLoading(true)
    setError(null)
    try {
      const record = await importGamelogFile(arrayBuffer, filename)
      const newIds = new Set(importedIds)
      newIds.add(record.id)
      setImportedIds(newIds)
      saveImportedGameIds(newIds)
      await loadGames()
    } catch (e) {
      setError(`Failed to import gamelog: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function processFiles(files) {
    for (const file of files) {
      if (file.name.endsWith('.zip')) {
        await processZipFile(file)
      } else if (file.name.endsWith('.gz')) {
        const buf = await file.arrayBuffer()
        await processGamelogFile(buf, file.name)
      }
    }
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) processFiles(files)
  }, [importedIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true) }, [])
  const handleDragLeave = useCallback(() => setDragOver(false), [])

  async function handleClearAll() {
    if (!window.confirm(`Delete all ${games.length} games? This cannot be undone.`)) return
    for (const game of games) {
      await deleteGamelog(game.id)
    }
    setImportedIds(new Set())
    saveImportedGameIds(new Set())
    setGames([])
  }

  async function handleClearImported() {
    const importedGames = games.filter(g => importedIds.has(g.id))
    if (!window.confirm(`Delete all ${importedGames.length} imported games? This cannot be undone.`)) return
    for (const game of importedGames) {
      await deleteGamelog(game.id)
    }
    const newIds = new Set(importedIds)
    importedGames.forEach(g => newIds.delete(g.id))
    setImportedIds(newIds)
    saveImportedGameIds(newIds)
    await loadGames()
  }

  async function handleClearPersonal() {
    const personalGames = games.filter(g => !importedIds.has(g.id))
    if (!window.confirm(`Delete all ${personalGames.length} personal games? This cannot be undone.`)) return
    for (const game of personalGames) {
      await deleteGamelog(game.id)
    }
    await loadGames()
  }

  const importedGames = games.filter(g => importedIds.has(g.id))
  const personalGames = games.filter(g => !importedIds.has(g.id))

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Game Library</h1>
        <p className="text-sm text-gray-500">Import shared game exports from teammates to build team-wide analytics.</p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-6 ${dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}
      >
        <label className="cursor-pointer flex flex-col items-center gap-2">
          <input
            type="file"
            accept=".zip,.gz"
            multiple
            className="sr-only"
            onChange={e => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) processFiles(files)
              e.target.value = ''
            }}
          />
          <span className="text-sm text-gray-600">Drop .zip exports or .logs.gz files here or click to upload</span>
          <span className="text-xs text-gray-400">Accepts game exports (.zip) and raw gamelogs (.logs.gz)</span>
        </label>
      </div>

      {loading && <div className="mb-4 text-sm text-gray-500">Processing files…</div>}
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {/* Stats overview */}
      {games.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Games</div>
            <div className="text-2xl font-bold text-gray-900">{games.length}</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Imported</div>
            <div className="text-2xl font-bold text-blue-600">{importedGames.length}</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Personal</div>
            <div className="text-2xl font-bold text-gray-600">{personalGames.length}</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Avg Turns</div>
            <div className="text-2xl font-bold text-gray-900">
              {games.length > 0 ? Math.round(games.reduce((sum, g) => sum + (g.turnCount || 0), 0) / games.length) : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Control bar */}
      {games.length > 0 && (
        <div className="mb-6 flex justify-end">
          <button
            onClick={handleClearAll}
            className="text-xs text-red-400 hover:text-red-600 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Opponent Metagame */}
      {games.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setMetagameOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Opponent Metagame</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${metagameOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {metagameOpen && (
            <div className="mt-6">
              <OpponentMetagameView games={games} />
            </div>
          )}
        </div>
      )}

      {/* Imported games section */}
      {importedGames.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setImportedOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Imported Games ({importedGames.length})</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); handleClearImported() }}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Clear
              </button>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${importedOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {importedOpen && (
            <div className="mt-6">
              <GamesList games={importedGames} onDelete={async (id) => {
                await deleteGamelog(id)
                const newIds = new Set(importedIds)
                newIds.delete(id)
                setImportedIds(newIds)
                saveImportedGameIds(newIds)
                await loadGames()
              }} />
            </div>
          )}
        </div>
      )}

      {/* Personal games section */}
      {personalGames.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setPersonalOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Personal Games ({personalGames.length})</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); handleClearPersonal() }}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Clear
              </button>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${personalOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {personalOpen && (
            <div className="mt-6">
              <GamesList games={personalGames} onDelete={async (id) => {
                await deleteGamelog(id)
                await loadGames()
              }} />
            </div>
          )}
        </div>
      )}

      {games.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No games yet — import a .zip export or .logs.gz file to get started.
        </div>
      )}
    </div>
  )
}

function GamesList({ games, onDelete }) {
  return (
    <div className="space-y-2">
      {games.map(g => (
        <GameListItem key={g.id} game={g} onDelete={onDelete} />
      ))}
    </div>
  )
}

function GameListItem({ game, onDelete }) {
  const p1Name = game.p1Name || 'Player 1'
  const p2Name = game.p2Name || 'Player 2'
  const p1IsWinner = game.winner === 1 || game.winner === '1'
  const p2IsWinner = game.winner === 2 || game.winner === '2'

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded border border-gray-100 hover:bg-gray-50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900 truncate">{p1Name}</span>
          {game.myInkCombo?.length > 0 && (
            <span className="flex items-center gap-0.5 flex-shrink-0">
              {game.myInkCombo.map(c => <InkImg key={c} color={c} size="w-3 h-3" />)}
            </span>
          )}
          <span className="text-xs text-gray-400">vs</span>
          <span className="font-medium text-sm text-gray-900 truncate">{p2Name}</span>
          {game.oppInkCombo?.length > 0 && (
            <span className="flex items-center gap-0.5 flex-shrink-0">
              {game.oppInkCombo.map(c => <InkImg key={c} color={c} size="w-3 h-3" />)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {p1IsWinner && <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">{p1Name} wins</span>}
          {p2IsWinner && <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">{p2Name} wins</span>}
          <span className="text-xs text-gray-500">{game.turnCount} turns</span>
          <span className="text-xs text-gray-400">{new Date(game.playedAt ?? game.savedAt).toLocaleDateString()}</span>
        </div>
      </div>
      <button
        onClick={() => onDelete(game.id)}
        className="text-xs opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
        title="Delete game"
      >
        ✕
      </button>
    </div>
  )
}

function OpponentMetagameView({ games }) {
  const metagame = analyzeOpponentMetagame(games)

  if (metagame.length === 0) {
    return <div className="text-sm text-gray-500">No opponent deck data available</div>
  }

  const maxPercentage = Math.max(...metagame.map(d => parseFloat(d.percentage)))

  return (
    <div className="space-y-4">
      {/* Horizontal bar chart */}
      <div className="space-y-3">
        {metagame.map(deck => (
          <div key={deck.colorString}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-gray-900 flex-shrink-0">{deck.colors.length > 0 ? deck.colors.map(c => c.charAt(0).toUpperCase()).join('/') : 'Unknown'}</span>
                {deck.colors.length > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {deck.colors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 text-sm ml-4">
                <span className="text-gray-600">{deck.gameCount}g</span>
                <span className="font-semibold text-gray-900 w-12 text-right">{deck.percentage}%</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all flex items-center justify-center"
                style={{ width: `${(parseFloat(deck.percentage) / maxPercentage) * 100}%` }}
              >
                {parseFloat(deck.percentage) > 5 && (
                  <span className="text-xs font-semibold text-white">{deck.percentage}%</span>
                )}
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-1">{deck.wins}W - {deck.losses}L ({deck.winRate}%)</div>
          </div>
        ))}
      </div>
    </div>
  )
}

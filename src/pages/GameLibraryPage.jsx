import { useState, useEffect, useCallback } from 'react'
import { getAllGamelogs, deleteGamelog } from '../lib/gamelogHistory'
import { importGamesFromZip } from '../lib/gameImport'
import { analyzeOpponentMetagame } from '../lib/metagameAnalysis'
import { buildWinrateMatrixFromGames } from '../lib/buildWinrateMatrix'
import { downloadGameIds } from '../lib/exportGameIds'
import { InkImg } from './GamelogAnalyzerPage'
import { createGameExportZip } from '../lib/gameExport'

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
  const [matchupOpen, setMatchupOpen] = useState(true)
  const [trendOpen, setTrendOpen] = useState(true)
  const [mmrTrendOpen, setMmrTrendOpen] = useState(true)
  const [turnDistOpen, setTurnDistOpen] = useState(true)

  useEffect(() => {
    loadGames()
  }, [])

  async function loadGames() {
    const allGames = await getAllGamelogs()
    setGames([...allGames].sort((a, b) => b.savedAt - a.savedAt))
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

  async function processFiles(files) {
    for (const file of files) {
      if (file.name.endsWith('.zip')) {
        await processZipFile(file)
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

  // Calculate overall stats
  const gamesWithMyPlayer = games.filter(g => g.myPlayerNum != null)
  const wins = gamesWithMyPlayer.filter(g => g.winner === String(g.myPlayerNum) || g.winner === g.myPlayerNum).length
  const losses = gamesWithMyPlayer.length - wins
  const winRate = gamesWithMyPlayer.length > 0 ? (wins / gamesWithMyPlayer.length * 100).toFixed(0) : 0

  const gamesFirst = gamesWithMyPlayer.filter(g => g.wentFirst === g.myPlayerNum || g.wentFirst === String(g.myPlayerNum))
  const gamesSecond = gamesWithMyPlayer.filter(g => g.wentFirst != null && g.wentFirst !== g.myPlayerNum && g.wentFirst !== String(g.myPlayerNum))
  const winsFirst = gamesFirst.filter(g => g.winner === g.myPlayerNum || g.winner === String(g.myPlayerNum)).length
  const winsSecond = gamesSecond.filter(g => g.winner === g.myPlayerNum || g.winner === String(g.myPlayerNum)).length
  const winRateFirst = gamesFirst.length > 0 ? Math.round(winsFirst / gamesFirst.length * 100) : null
  const winRateSecond = gamesSecond.length > 0 ? Math.round(winsSecond / gamesSecond.length * 100) : null

  // Calculate MMR and play time stats from imported games
  const importedWithMMR = importedGames.filter(g => g.mmr_delta != null).sort((a, b) => a.playedAt - b.playedAt)
  let currentMMR = null
  if (importedWithMMR.length > 0) {
    const firstMMR = importedWithMMR[0].mmr_before ?? 0
    const netMMR = importedWithMMR.reduce((sum, g) => sum + (g.mmr_delta || 0), 0)
    currentMMR = firstMMR + netMMR
  }

  const totalPlayTime = games.reduce((sum, g) => sum + (g.duration_seconds || 0), 0)

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
            accept=".zip"
            multiple
            className="sr-only"
            onChange={e => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) processFiles(files)
              e.target.value = ''
            }}
          />
          <span className="text-sm text-gray-600">Drop a .zip game export here or click to upload</span>
          <span className="text-xs text-gray-400">Export your games from the Gamelog Analyzer, then share and import here</span>
        </label>
      </div>

      {loading && <div className="mb-4 text-sm text-gray-500">Processing files…</div>}
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {/* Stats overview */}
      {games.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
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
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Current MMR</div>
            <div className="text-2xl font-bold text-purple-600">{currentMMR !== null ? currentMMR.toFixed(0) : '—'}</div>
            <div className="text-xs text-gray-400 mt-0.5">{importedWithMMR.length} games tracked</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Play Time</div>
            <div className="text-2xl font-bold text-gray-900">{Math.floor(totalPlayTime / 60)}h {totalPlayTime % 60}m</div>
            <div className="text-xs text-gray-400 mt-0.5">{games.reduce((sum, g) => sum + (g.turnCount || 0), 0)} turns</div>
          </div>
        </div>
      )}


      {/* Overall Stats */}
      {gamesWithMyPlayer.length > 0 && (
        <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Overall</div>
            <div className="text-2xl font-bold text-gray-900">{winRate}%</div>
            <div className="text-xs text-gray-400 mt-0.5">{wins}–{losses}</div>
          </div>
          {winRateFirst != null && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Going 1st</div>
              <div className="text-2xl font-bold text-gray-900">{winRateFirst}%</div>
              <div className="text-xs text-gray-400 mt-0.5">{winsFirst}–{gamesFirst.length - winsFirst}</div>
            </div>
          )}
          {winRateSecond != null && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Going 2nd</div>
              <div className="text-2xl font-bold text-gray-900">{winRateSecond}%</div>
              <div className="text-xs text-gray-400 mt-0.5">{winsSecond}–{gamesSecond.length - winsSecond}</div>
            </div>
          )}
        </div>
      )}

      {/* Turn Distribution */}
      {games.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setTurnDistOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Turn Distribution</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${turnDistOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {turnDistOpen && (
            <div className="mt-6">
              <TurnDistributionView games={games} />
            </div>
          )}
        </div>
      )}

      {/* Win Rate Trend */}
      {games.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setTrendOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Win Rate Trend</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${trendOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {trendOpen && (
            <div className="mt-6">
              <WinRateTrendView games={games} />
            </div>
          )}
        </div>
      )}

      {/* MMR Trend */}
      {games.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setMmrTrendOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">MMR Trend</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${mmrTrendOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {mmrTrendOpen && (
            <div className="mt-6">
              <MMRTrendView games={games} />
            </div>
          )}
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

      {/* Matchup Matrix */}
      {games.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setMatchupOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Matchup Matrix</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${matchupOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {matchupOpen && (
            <div className="mt-6">
              <MatchupMatrixView games={games} />
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
                onClick={(e) => { e.stopPropagation(); downloadGameIds([], games.map(g => g.id)) }}
                className="text-xs text-blue-400 hover:text-blue-600 transition-colors"
              >
                Export IDs
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleClearAll() }}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Clear all
              </button>
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
          No games yet — import a .zip game export to get started.
        </div>
      )}
    </div>
  )
}

function GamesList({ games, onDelete }) {
  return (
    <div className="space-y-1">
      {games.map(g => (
        <GameListItem key={g.id} game={g} onDelete={onDelete} />
      ))}
    </div>
  )
}

function GameListItem({ game, onDelete }) {
  const p1Name = game.p1Name || 'Player 1'
  const p2Name = game.p2Name || 'Player 2'
  const myNum = game.myPlayerNum
  const myDisplayLabel = myNum === 1 ? p1Name : myNum === 2 ? p2Name : p1Name
  const oppDisplayLabel = myNum === 1 ? p2Name : myNum === 2 ? p1Name : p2Name
  const myColors = game.myInkCombo ?? []
  const oppColors = game.oppInkCombo ?? []
  const won = myNum != null && (game.winner === myNum || game.winner === String(myNum))

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-50 transition-colors">
      {myNum != null && (
        <span className={`text-[10px] font-bold w-6 text-center flex-shrink-0 ${won ? 'text-emerald-600' : 'text-red-500'}`}>
          {won ? 'W' : 'L'}
        </span>
      )}
      <span className="flex items-center gap-1 font-medium text-sm flex-1 min-w-0">
        <span className="truncate">{myDisplayLabel}</span>
        {myColors.length > 0 && (
          <span className="flex items-center gap-0.5 flex-shrink-0">
            {myColors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
          </span>
        )}
        <span className="text-xs text-gray-400 flex-shrink-0">vs</span>
        <span className="truncate">{oppDisplayLabel}</span>
        {oppColors.length > 0 && (
          <span className="flex items-center gap-0.5 flex-shrink-0">
            {oppColors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
          </span>
        )}
      </span>
      <span className="text-xs text-gray-400 flex-shrink-0">{game.turnCount}T</span>
      <span className="text-xs text-gray-400 flex-shrink-0">{new Date(game.playedAt ?? game.savedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
      <button
        onClick={() => createGameExportZip([game], `lorcana-${game.id}`)}
        className="text-xs opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
        title="Export game"
      >⬇</button>
      <button
        onClick={() => onDelete(game.id)}
        className="text-xs opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
        title="Delete game"
      >✕</button>
    </div>
  )
}

function MatchupMatrixView({ games }) {
  const { matchups } = buildWinrateMatrixFromGames(games)

  if (matchups.length === 0) {
    return <div className="text-sm text-gray-500">No matchup data available</div>
  }

  // Color helper for winrate cells
  const getWinrateColor = (winRate) => {
    if (winRate >= 60) return 'bg-green-300'
    if (winRate >= 55) return 'bg-green-200'
    if (winRate >= 51) return 'bg-green-100'
    if (winRate >= 49) return 'bg-gray-50'
    if (winRate >= 45) return 'bg-red-100'
    if (winRate >= 40) return 'bg-red-200'
    return 'bg-red-300'
  }

  // Extract unique user decks (rows) and opponent decks (columns) from matchups
  const userDeckMap = new Map()
  const oppDeckMap = new Map()

  matchups.forEach(m => {
    const userKey = JSON.stringify(m.colorsA)
    const oppKey = JSON.stringify(m.colorsB)

    if (!userDeckMap.has(userKey)) {
      userDeckMap.set(userKey, { colors: m.colorsA, wins: 0, games: 0 })
    }
    if (!oppDeckMap.has(oppKey)) {
      oppDeckMap.set(oppKey, { colors: m.colorsB, wins: 0, games: 0 })
    }

    // Aggregate stats for user decks (rows)
    userDeckMap.get(userKey).wins += m.winsA
    userDeckMap.get(userKey).games += m.games

    // Aggregate stats for opponent decks (columns) - from opponent perspective
    oppDeckMap.get(oppKey).wins += (m.games - m.winsA)
    oppDeckMap.get(oppKey).games += m.games
  })

  const userDecks = Array.from(userDeckMap.values()).sort((a, b) => b.wins / b.games - a.wins / a.games)
  const oppDecks = Array.from(oppDeckMap.values()).sort((a, b) => b.wins / b.games - a.wins / a.games)

  // Build lookup map for quick access
  const matchupMap = new Map()
  matchups.forEach(m => {
    const key = `${JSON.stringify(m.colorsA)}-${JSON.stringify(m.colorsB)}`
    matchupMap.set(key, m)
  })

  // Get matchup (with reverse lookup, flipping first/second perspective)
  const getMatchup = (playerColors, oppColors) => {
    const key = `${JSON.stringify(playerColors)}-${JSON.stringify(oppColors)}`
    let matchup = matchupMap.get(key)

    if (!matchup) {
      const reverseKey = `${JSON.stringify(oppColors)}-${JSON.stringify(playerColors)}`
      const reverseMatchup = matchupMap.get(reverseKey)
      if (reverseMatchup) {
        // Flip win counts and first/second perspective:
        // original "first" = opponent went first = user went second (and vice versa)
        const rf = reverseMatchup
        matchup = {
          ...rf,
          colorsA: rf.colorsB,
          colorsB: rf.colorsA,
          winsA: rf.games - rf.winsA,
          gamesFirst: rf.gamesSecond,
          winsFirst: rf.gamesSecond - rf.winsSecond,
          gamesSecond: rf.gamesFirst,
          winsSecond: rf.gamesFirst - rf.winsFirst,
          winRateFirst: rf.gamesSecond > 0 ? ((rf.gamesSecond - rf.winsSecond) / rf.gamesSecond * 100) : null,
          winRateSecond: rf.gamesFirst > 0 ? ((rf.gamesFirst - rf.winsFirst) / rf.gamesFirst * 100) : null,
        }
      }
    }

    return matchup
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Header row */}
        <div className="flex mb-2">
          <div className="w-24 h-16 flex-shrink-0" />
          {oppDecks.map((colPair, colIdx) => (
            <div
              key={colIdx}
              className="w-24 h-16 flex-shrink-0 flex items-center justify-center text-xs font-semibold"
            >
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span className="text-[10px] font-medium text-gray-600">OPP</span>
                <div className="flex items-center gap-0.5">
                  {colPair.colors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Data rows */}
        {userDecks.map((rowPair, rowIdx) => (
          <div key={rowIdx} className="flex mb-2">
            {/* Row header */}
            <div className="w-24 h-28 flex-shrink-0 flex items-center justify-center text-xs font-semibold border-r border-gray-100">
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span className="text-[10px] font-medium text-gray-600">YOU</span>
                <div className="flex items-center gap-0.5">
                  {rowPair.colors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
                </div>
              </div>
            </div>

            {/* Data cells */}
            {oppDecks.map((colPair, colIdx) => {
              const matchup = getMatchup(rowPair.colors, colPair.colors)
              if (!matchup) {
                return (
                  <div key={colIdx} className="w-24 h-20 flex-shrink-0 bg-gray-50 border border-gray-100" />
                )
              }

              const winRate = (matchup.winsA / matchup.games * 100).toFixed(0)
              const firstStr = matchup.gamesFirst > 0
                ? `${Math.round(matchup.winsFirst / matchup.gamesFirst * 100)}%`
                : null
              const secondStr = matchup.gamesSecond > 0
                ? `${Math.round(matchup.winsSecond / matchup.gamesSecond * 100)}%`
                : null

              return (
                <div
                  key={colIdx}
                  className={`w-24 h-28 flex-shrink-0 border border-gray-200 flex flex-col items-center justify-center text-center group relative cursor-help px-1 ${getWinrateColor(winRate)}`}
                >
                  <div className="text-sm font-bold text-gray-900">{winRate}%</div>
                  <div className="text-xs text-gray-600">{matchup.winsA}W-{matchup.games - matchup.winsA}L</div>
                  {(firstStr || secondStr) && (
                    <div className="mt-1 text-[10px] text-gray-500 leading-tight">
                      {firstStr && <div>1st: {firstStr}</div>}
                      {secondStr && <div>2nd: {secondStr}</div>}
                    </div>
                  )}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {matchup.games} games
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function TurnDistributionView({ games }) {
  const eligible = games.filter(g => g.myPlayerNum != null && g.turnCount > 0)
  if (eligible.length === 0) return <div className="text-sm text-gray-500">No turn data available.</div>

  // Group by turn count
  const byTurn = {}
  for (const g of eligible) {
    const t = g.turnCount
    if (!byTurn[t]) byTurn[t] = { wins: 0, losses: 0 }
    const won = g.winner === g.myPlayerNum || g.winner === String(g.myPlayerNum)
    if (won) byTurn[t].wins++
    else byTurn[t].losses++
  }

  const turns = Object.keys(byTurn).map(Number).sort((a, b) => a - b)
  const maxGames = Math.max(...turns.map(t => byTurn[t].wins + byTurn[t].losses))
  const CHART_H = 120

  return (
    <div>
      <div className="text-xs text-gray-400 mb-4">Green = wins, red = losses</div>
      <div className="flex items-end gap-1.5">
        {turns.map(t => {
          const { wins, losses } = byTurn[t]
          const total = wins + losses
          const winPx = Math.round((wins / maxGames) * CHART_H)
          const lossPx = Math.round((losses / maxGames) * CHART_H)
          return (
            <div key={t} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div className="text-[10px] text-gray-500 font-medium">{total}</div>
              <div className="w-full flex flex-col justify-end rounded-sm overflow-hidden" style={{ height: `${CHART_H}px` }}>
                <div className="w-full bg-emerald-400" style={{ height: `${winPx}px` }} />
                <div className="w-full bg-red-300" style={{ height: `${lossPx}px` }} />
              </div>
              <div className="text-[10px] text-gray-500">{t}</div>
            </div>
          )
        })}
      </div>
      <div className="text-xs text-gray-400 mt-1 text-center">Turn count</div>
    </div>
  )
}

function WinRateTrendView({ games }) {
  const sorted = [...games]
    .filter(g => g.myPlayerNum != null && g.playedAt != null)
    .sort((a, b) => a.playedAt - b.playedAt)

  if (sorted.length < 2) {
    return <div className="text-sm text-gray-500">Not enough games to show a trend.</div>
  }

  const WINDOW = 10
  const W = 1000
  const H = 200
  const PAD = { top: 16, right: 16, bottom: 32, left: 40 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  // Rolling win rate at each game index
  const points = sorted.map((game, i) => {
    const slice = sorted.slice(Math.max(0, i - WINDOW + 1), i + 1)
    const wins = slice.filter(g => g.winner === g.myPlayerNum || g.winner === String(g.myPlayerNum)).length
    return wins / slice.length
  })

  const xPos = (i) => PAD.left + (i / (sorted.length - 1)) * chartW
  const yPos = (rate) => PAD.top + (1 - rate) * chartH

  const linePath = points.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(r).toFixed(1)}`).join(' ')

  // X-axis date labels (first, middle, last)
  const labelIdxs = [0, Math.floor((sorted.length - 1) / 2), sorted.length - 1]
  const formatDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <div>
      <div className="text-xs text-gray-400 mb-2">Rolling {WINDOW}-game win rate</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(r => (
          <g key={r}>
            <line
              x1={PAD.left} y1={yPos(r)} x2={W - PAD.right} y2={yPos(r)}
              stroke={r === 0.5 ? '#9ca3af' : '#e5e7eb'} strokeWidth={r === 0.5 ? 1.5 : 1} strokeDasharray={r === 0.5 ? '6 3' : ''}
            />
            <text x={PAD.left - 6} y={yPos(r) + 4} textAnchor="end" fontSize={18} fill="#9ca3af">{r * 100}%</text>
          </g>
        ))}

        {/* Individual game dots */}
        {sorted.map((game, i) => {
          const won = game.winner === game.myPlayerNum || game.winner === String(game.myPlayerNum)
          return (
            <circle
              key={i}
              cx={xPos(i)} cy={yPos(won ? 1 : 0)}
              r={5}
              fill={won ? '#86efac' : '#fca5a5'}
              opacity={0.5}
            />
          )
        })}

        {/* Rolling win rate line */}
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots on the line */}
        {points.map((r, i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(r)} r={4} fill="#3b82f6" />
        ))}

        {/* X-axis date labels */}
        {labelIdxs.map(i => (
          <text
            key={i} x={xPos(i)} y={H - 4}
            textAnchor={i === 0 ? 'start' : i === sorted.length - 1 ? 'end' : 'middle'}
            fontSize={16} fill="#9ca3af"
          >
            {formatDate(sorted[i].playedAt)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function MMRTrendView({ games }) {
  const sorted = [...games]
    .filter(g => g.mmr_delta != null && g.playedAt != null)
    .sort((a, b) => a.playedAt - b.playedAt)

  if (sorted.length === 0) {
    return <div className="text-sm text-gray-500">No imported games with MMR data available. Import games from match history to see MMR trends.</div>
  }

  const W = 1000
  const H = 200
  const PAD = { top: 16, right: 16, bottom: 32, left: 40 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  // Build actual MMR points: start with mmr_before of first game, then mmr_after of each game
  const startMMR = sorted[0].mmr_before ?? (sorted[0].mmr_after != null ? sorted[0].mmr_after - sorted[0].mmr_delta : 0)
  const points = sorted.map(game => game.mmr_after ?? (startMMR + sorted.slice(0, sorted.indexOf(game) + 1).reduce((s, g) => s + g.mmr_delta, 0)))

  // All values including start point for min/max
  const allValues = [startMMR, ...points]
  const minMMR = Math.min(...allValues)
  const maxMMR = Math.max(...allValues)
  const range = maxMMR - minMMR

  // Add padding to y-axis
  const paddedMin = minMMR - (range * 0.1 || 10)
  const paddedMax = maxMMR + (range * 0.1 || 10)
  const paddedRange = paddedMax - paddedMin

  // x positions: index 0 = start point (before first game), index 1..n = after each game
  const totalPoints = points.length + 1
  const xPos = (i) => PAD.left + (i / Math.max(1, totalPoints - 1)) * chartW
  const yPos = (mmr) => PAD.top + (1 - (mmr - paddedMin) / paddedRange) * chartH

  const allPoints = [startMMR, ...points]
  const linePath = allPoints.map((mmr, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(mmr).toFixed(1)}`).join(' ')

  // X-axis date labels (first, middle, last) — offset by 1 for start point
  const labelIdxs = [1, Math.floor((totalPoints - 1) / 2), totalPoints - 1]
  const formatDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  // Grid lines at round MMR values
  const gridLines = []
  const gridStep = Math.max(1, Math.pow(10, Math.floor(Math.log10(paddedRange / 4))))
  for (let mmr = Math.ceil(paddedMin / gridStep) * gridStep; mmr <= paddedMax; mmr += gridStep) {
    gridLines.push(mmr)
  }

  // Calculate summary statistics
  const endMMR = points[points.length - 1]
  const netMMR = endMMR - startMMR
  const highestMMR = maxMMR
  const lowestMMR = minMMR

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Start MMR</div>
          <div className="text-lg font-bold text-gray-900">{startMMR.toFixed(0)}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">End MMR</div>
          <div className="text-lg font-bold text-gray-900">{endMMR.toFixed(0)}</div>
        </div>
        <div className={`bg-gray-50 border rounded-lg p-3 ${netMMR >= 0 ? 'border-green-200' : 'border-red-200'}`}>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Net Change</div>
          <div className={`text-lg font-bold ${netMMR >= 0 ? 'text-green-600' : 'text-red-600'}`}>{netMMR >= 0 ? '+' : ''}{netMMR.toFixed(0)}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Highest</div>
          <div className="text-lg font-bold text-gray-900">{highestMMR.toFixed(0)}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Lowest</div>
          <div className="text-lg font-bold text-gray-900">{lowestMMR.toFixed(0)}</div>
        </div>
      </div>
      <div className="text-xs text-gray-400 mb-2">MMR over time (imported games only)</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
        {/* Grid lines */}
        {gridLines.map(mmr => (
          <g key={mmr}>
            <line
              x1={PAD.left} y1={yPos(mmr)} x2={W - PAD.right} y2={yPos(mmr)}
              stroke="#e5e7eb" strokeWidth={1} strokeDasharray="6 3"
            />
            <text x={PAD.left - 6} y={yPos(mmr) + 4} textAnchor="end" fontSize={18} fill="#9ca3af">{mmr.toFixed(0)}</text>
          </g>
        ))}

        {/* Individual game result dots (offset by 1 for start point) */}
        {sorted.map((game, i) => {
          const mmr = points[i]
          const isWin = game.mmr_delta > 0
          return (
            <circle
              key={i}
              cx={xPos(i + 1)} cy={yPos(mmr)}
              r={5}
              fill={isWin ? '#86efac' : '#fca5a5'}
              opacity={0.5}
            />
          )
        })}

        {/* MMR line */}
        <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots on the line */}
        {allPoints.map((mmr, i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(mmr)} r={4} fill="#8b5cf6" />
        ))}

        {/* X-axis date labels */}
        {labelIdxs.map(i => (
          <text
            key={i} x={xPos(i)} y={H - 4}
            textAnchor={i === 1 ? 'start' : i === totalPoints - 1 ? 'end' : 'middle'}
            fontSize={16} fill="#9ca3af"
          >
            {formatDate(sorted[i - 1].playedAt)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function OpponentMetagameView({ games }) {
  const metagame = analyzeOpponentMetagame(games)

  if (metagame.length === 0) {
    return <div className="text-sm text-gray-500">No opponent deck data available</div>
  }

  return (
    <div className="space-y-4">
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
                style={{ width: `${parseFloat(deck.percentage)}%` }}
              >
                {parseFloat(deck.percentage) > 8 && (
                  <span className="text-xs font-semibold text-white">{deck.percentage}%</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllGamelogs, deleteGamelog, saveGamelog } from '../lib/gamelogHistory'
import { importGamesFromZip } from '../lib/gameImport'
import { downloadGameIds } from '../lib/exportGameIds'
import { decompressGzip, parseGamelog } from '../lib/parseGamelog'
import { fetchDecks, fetchPersonalStats, getToken, getTokens } from '../lib/duelsApi'
import { useCards } from '../hooks/useCards'
import { InkIcon as InkImg } from '../components/InkIcons'
import { getMyPlayerNum, enrichGame } from '../lib/analyticsAggregation'
import { deckFingerprint } from '../lib/deckFingerprint'
import { DecklistDisplay, GamesList } from '../components/analytics/GamesList'
import {
  MatchupMatrixView,
  TurnDistributionView,
  WinRateTrendView,
  MMRTrendView,
  CardImpactView,
  OpponentMetagameView,
} from '../components/analytics/MatchupViews'
import { DeckStats, ChallengeStats } from '../components/analytics/StatTables'
import { LeakReport } from '../components/analytics/LeakReport'
import { GamelogDetail } from '../components/analytics/GamelogDetail'

const MY_NAME_KEY = 'lorcana_my_name'

const IMPORTED_GAMES_KEY = 'lorcana_imported_game_ids'

function getImportedGameIds() {
  const stored = localStorage.getItem(IMPORTED_GAMES_KEY)
  return stored ? new Set(JSON.parse(stored)) : new Set()
}

function saveImportedGameIds(ids) {
  localStorage.setItem(IMPORTED_GAMES_KEY, JSON.stringify(Array.from(ids)))
}

export function AnalyticsPage() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [importedIds, setImportedIds] = useState(getImportedGameIds())
  const [importedOpen, setImportedOpen] = useState(true)
  const [personalOpen, setPersonalOpen] = useState(true)
  const [metagameOpen, setMetagameOpen] = useState(true)
  const [matchupOpen, setMatchupOpen] = useState(true)
  const [cardImpactOpen, setCardImpactOpen] = useState(true)
  const [trendOpen, setTrendOpen] = useState(true)
  const [mmrTrendOpen, setMmrTrendOpen] = useState(true)
  const [turnDistOpen, setTurnDistOpen] = useState(true)
  const [filterPlayer, setFilterPlayer] = useState(null)
  const [filterDeck, setFilterDeck] = useState(null)
  const [filterQueue, setFilterQueue] = useState(null)
  const [filterMyColors, setFilterMyColors] = useState(null)
  const [filterOppColors, setFilterOppColors] = useState(null)
  const [filterDate, setFilterDate] = useState(null)
  const [excludeAfk, setExcludeAfk] = useState(false)
  const [apiDeckNames, setApiDeckNames] = useState({})
  const [insightsLoading, setInsightsLoading] = useState(null)
  const [expandedDeckKey, setExpandedDeckKey] = useState(null)
  const [myName, setMyName] = useState(() => localStorage.getItem(MY_NAME_KEY) ?? '')
  const [nameInput, setNameInput] = useState(() => localStorage.getItem(MY_NAME_KEY) ?? '')
  const [activeId, setActiveId] = useState(null)
  const [deckVersionsByDeckId, setDeckVersionsByDeckId] = useState({})

  const navigate = useNavigate()
  const { cards } = useCards()
  const cardIdToName = useMemo(() => {
    const cardByKey = {}
    const score = c => {
      const promoBonus = (c.promoGrouping == null && c.promoSourceCategory == null) ? 10 : 0
      if (c.allowedInFormats?.Core?.allowed) return promoBonus + 2
      if (c.allowedInFormats?.Infinity?.allowed) return promoBonus + 1
      return promoBonus
    }
    for (const c of cards) {
      if (c.setCode == null || c.number == null) continue
      const key = `${c.setCode}-${c.number}`
      const existing = cardByKey[key]
      if (!existing) { cardByKey[key] = c; continue }
      const ts = score(c), es = score(existing)
      if (ts > es) { cardByKey[key] = c; continue }
      if (ts === es && (parseInt(c.setCode) || 0) > (parseInt(existing.setCode) || 0)) cardByKey[key] = c
    }
    const map = {}
    for (const [key, c] of Object.entries(cardByKey)) map[key] = c.fullName ?? c.name
    return map
  }, [cards])

  useEffect(() => {
    loadGames()

    const pending = sessionStorage.getItem('lorcana_pending_gamelog')
    if (pending) {
      sessionStorage.removeItem('lorcana_pending_gamelog')
      try {
        const { base64, filename } = JSON.parse(pending)
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true)
        processGzBuffer(bytes.buffer, filename).then(loadGames).catch(e => setError(e.message)).finally(() => setLoading(false))
      } catch (e) {
        setError(e.message)
      }
    }
  }, [])

  useEffect(() => {
    if (!getToken()) return
    fetchDecks()
      .then(data => {
        const names = {}
        for (const d of data.decks ?? []) names[d.id] = d.name
        setApiDeckNames(names)
      })
      .catch(() => {})
  }, [])

  async function loadGames() {
    const allGames = await getAllGamelogs()
    setGames([...allGames].sort((a, b) => (b.playedAt ?? b.savedAt) - (a.playedAt ?? a.savedAt)))
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

  async function processGzBuffer(arrayBuffer, filename) {
    const text = await decompressGzip(arrayBuffer)
    const logs = JSON.parse(text)
    const id = filename.replace(/\.logs\.gz$/i, '').replace(/\.gz$/i, '') || crypto.randomUUID()
    const parsed = parseGamelog(id, logs)
    await saveGamelog(id, parsed, logs)
    setActiveId(id)
    return id
  }

  async function processGzFile(file) {
    setLoading(true)
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      await processGzBuffer(buf, file.name)
      await loadGames()
    } catch (e) {
      setError(`Failed to import ${file.name}: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function processFiles(files) {
    for (const file of files) {
      if (file.name.endsWith('.zip')) {
        await processZipFile(file)
      } else if (file.name.endsWith('.gz')) {
        await processGzFile(file)
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

  function saveName(name) {
    const trimmed = name.trim()
    setMyName(trimmed)
    localStorage.setItem(MY_NAME_KEY, trimmed)
  }

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

  async function handleLoadInsights(deckStat) {
    setInsightsLoading(deckStat.fp)
    try {
      const decklist = deckStat.latestDecklist
      if (!decklist?.length) return
      const lines = decklist.map(({ cardId, count }) => `${count} ${cardIdToName[cardId] ?? cardId}`)
      localStorage.setItem('drawOdds.deckText', lines.join('\n'))
      navigate('/deck-insights')
    } finally {
      setInsightsLoading(null)
    }
  }

  // Build filter options from stored gamelogs
  const DATE_PRESETS = [
    { key: '3d', label: 'Last 3 days', days: 3 },
    { key: '7d', label: 'Last 7 days', days: 7 },
    { key: '14d', label: 'Last 14 days', days: 14 },
    { key: '21d', label: 'Last 21 days', days: 21 },
    { key: 'month', label: 'Last month', days: 30 },
  ]
  const dateCutoff = filterDate ? Date.now() - (DATE_PRESETS.find(p => p.key === filterDate)?.days ?? 0) * 86400000 : null
  const dateFilteredGamesRaw = dateCutoff ? games.filter(g => (g.playedAt ?? g.savedAt) >= dateCutoff) : games
  // "afk" is a direct disconnect claim; "timeout" is excluded outright too, since a clock
  // running out (with or without an observed disconnect) isn't a guaranteed real loss.
  const isAfkGame = (g) => g.victoryReason === 'afk' || g.victoryReason === 'timeout'
  const afkCount = dateFilteredGamesRaw.filter(isAfkGame).length
  const dateFilteredGames = excludeAfk
    ? dateFilteredGamesRaw.filter(g => !isAfkGame(g))
    : dateFilteredGamesRaw

  const colorKey = (arr) => arr?.length ? arr.slice().sort().join('/') : null

  // userId → display label for all tokens (used in game rows and player filter)
  const userIdToLabel = useMemo(() => {
    const map = {}
    for (const t of getTokens()) if (t.userId) map[t.userId] = t.username || t.label
    return map
  }, [])

  // Player filter — derived from tokens whose userId matches games in the library
  const playerOptions = useMemo(() => {
    const gameUserIds = new Set(games.map(g => g.userId).filter(Boolean))
    if (gameUserIds.size < 2) return []
    return getTokens()
      .filter(t => t.userId && gameUserIds.has(t.userId))
      .map(t => ({ userId: t.userId, label: t.username || t.label }))
  }, [games])

  const playerFilteredGames = filterPlayer
    ? dateFilteredGames.filter(g => g.userId === filterPlayer)
    : dateFilteredGames

  const queues = [...new Set(playerFilteredGames.map(g => g.queue_name).filter(Boolean))].sort()

  const myColorOptions = [...new Set(
    playerFilteredGames.map(g => colorKey(g.myInkCombo)).filter(k => k && k.split('/').length === 2)
  )].sort()
  const oppColorOptions = [...new Set(
    playerFilteredGames.map(g => colorKey(g.oppInkCombo)).filter(k => k && k.split('/').length === 2)
  )].sort()

  const queueFilteredGames = filterQueue
    ? playerFilteredGames.filter(g => g.queue_name === filterQueue)
    : playerFilteredGames

  const colorFilteredGames = queueFilteredGames
    .filter(g => !filterMyColors || colorKey(g.myInkCombo) === filterMyColors)
    .filter(g => !filterOppColors || colorKey(g.oppInkCombo) === filterOppColors)

  // Build deck stats from color-filtered games
  // Use deck_id as primary key (stable across deck versions), fall back to fingerprint
  const getDeckKey = (g) => g.deck_id ?? deckFingerprint(g.yourDecklist)
  const deckStatMap = new Map()
  for (const g of colorFilteredGames) {
    const key = getDeckKey(g)
    if (!key) continue
    if (!deckStatMap.has(key)) {
      deckStatMap.set(key, {
        fp: key,
        colors: g.myInkCombo ?? [],
        name: g.deckName ?? apiDeckNames[g.deck_id] ?? null,
        wins: 0, losses: 0, loreTotal: 0, loreGames: 0,
        latestDecklist: g.yourDecklist ?? null,
      })
    }
    const stat = deckStatMap.get(key)
    const myNum = g.myPlayerNum
    if (myNum != null) {
      const won = g.winner === myNum || g.winner === String(myNum)
      if (won) stat.wins++
      else stat.losses++
    }
    const myLore = g.myPlayerNum === 1 ? g.p1FinalLore : g.myPlayerNum === 2 ? g.p2FinalLore : null
    if (myLore != null) { stat.loreTotal += myLore; stat.loreGames++ }
  }
  const deckStats = [...deckStatMap.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))

  const filteredGames = filterDeck
    ? colorFilteredGames.filter(g => getDeckKey(g) === filterDeck)
    : colorFilteredGames

  // Only a real duels.ink deck_id (not the local decklist-fingerprint fallback) can be
  // looked up against the personal-stats API for authoritative per-version card lists.
  const selectedDeckId = filterDeck && filteredGames.some(g => g.deck_id === filterDeck) ? filterDeck : null

  useEffect(() => {
    if (!selectedDeckId || !getToken() || deckVersionsByDeckId[selectedDeckId]) return
    fetchPersonalStats({ deckId: selectedDeckId })
      .then(data => setDeckVersionsByDeckId(prev => ({ ...prev, [selectedDeckId]: data.deckVersions ?? [] })))
      .catch(() => setDeckVersionsByDeckId(prev => ({ ...prev, [selectedDeckId]: [] })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeckId])

  const importedGames = filteredGames.filter(g => importedIds.has(g.id))
  const personalGames = filteredGames.filter(g => !importedIds.has(g.id))

  const enrichedGames = filteredGames.flatMap(g => { const e = enrichGame(g, myName); return e ? [e] : [] })
  const activeGamelog = games.find(g => g.id === activeId) ?? null
  const activeMyPlayerNum = activeGamelog ? (activeGamelog.myPlayerNum ?? getMyPlayerNum(activeGamelog, myName)) : null

  // Calculate overall stats from enriched games (picks up myName-resolved games too,
  // and shares its win/first-player resolution with the personal-analysis section
  // below instead of recomputing it a second way).
  const wins = enrichedGames.filter(g => g.won).length
  const losses = enrichedGames.length - wins
  const winRate = enrichedGames.length > 0 ? (wins / enrichedGames.length * 100).toFixed(0) : 0

  const gamesFirst = enrichedGames.filter(g => g.wentFirst)
  const gamesSecond = enrichedGames.filter(g => !g.wentFirst)
  const winsFirst = gamesFirst.filter(g => g.won).length
  const winsSecond = gamesSecond.filter(g => g.won).length
  const winRateFirst = gamesFirst.length > 0 ? Math.round(winsFirst / gamesFirst.length * 100) : null
  const winRateSecond = gamesSecond.length > 0 ? Math.round(winsSecond / gamesSecond.length * 100) : null

  // BO3 match-level record (2+ game wins/losses within a match_id)
  const bo3Games = enrichedGames.filter(g => g.match_id)
  const matchGroups = {}
  for (const g of bo3Games) {
    if (!matchGroups[g.match_id]) matchGroups[g.match_id] = []
    matchGroups[g.match_id].push(g)
  }
  const completeMatches = Object.values(matchGroups).filter(matchGames => {
    const w = matchGames.filter(g => g.won).length
    const l = matchGames.filter(g => !g.won).length
    return w >= 2 || l >= 2
  })
  const matchWins = completeMatches.filter(matchGames => matchGames.filter(g => g.won).length >= 2).length
  const matchLosses = completeMatches.filter(matchGames => matchGames.filter(g => !g.won).length >= 2).length

  // Calculate MMR range from filtered games with MMR data
  const gamesWithMMR = filteredGames.filter(g => g.mmr_delta != null).sort((a, b) => a.playedAt - b.playedAt)
  let mmrRange = null
  if (gamesWithMMR.length > 0) {
    const startMMR = gamesWithMMR[0].mmr_before ?? gamesWithMMR[0].mmr_after ?? 0
    const allMMR = [startMMR, ...gamesWithMMR.map(g => g.mmr_after ?? startMMR)]
    mmrRange = { low: Math.min(...allMMR), peak: Math.max(...allMMR) }
  }

  const totalPlayTime = filteredGames.reduce((sum, g) => sum + (g.duration_seconds || 0), 0)

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Analytics</h1>
        <p className="text-sm text-gray-500">Import your games (or teammates' shared exports) for personal and team-wide analytics.</p>
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
          <span className="text-sm text-gray-600">Drop a .zip game export or .logs.gz gamelog here, or click to upload</span>
          <span className="text-xs text-gray-400">.zip = shared team exports (export from the Personal/Imported lists below) · .logs.gz = a single raw gamelog</span>
        </label>
      </div>

      {loading && <div className="mb-4 text-sm text-gray-500">Processing files…</div>}
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {/* Player name setting — only needed for .logs.gz files without myPlayerNum metadata */}
      {games.some(g => g.myPlayerNum == null) && (
        <div className="mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Your player name:</label>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={() => saveName(nameInput)}
              onKeyDown={e => { if (e.key === 'Enter') { saveName(nameInput); e.currentTarget.blur() } }}
              placeholder="e.g. Teagan"
              className="flex-1 min-w-48 text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder:text-gray-300"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Only needed to identify your side of games imported as raw <span className="font-medium">.logs.gz files</span> — games from Match History or a team .zip export already know which side is you.
          </p>
        </div>
      )}

      {/* Date filter */}
      {games.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20 flex-shrink-0">Period</span>
          {DATE_PRESETS.map(p => (
            <button key={p.key} onClick={() => setFilterDate(prev => prev === p.key ? null : p.key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterDate === p.key ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
            >{p.label}</button>
          ))}
        </div>
      )}

      {/* AFK filter */}
      {afkCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20 flex-shrink-0">AFK</span>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeAfk}
              onChange={e => setExcludeAfk(e.target.checked)}
              className="rounded border-gray-300"
            />
            Exclude AFK/timeout-decided games ({afkCount})
          </label>
        </div>
      )}

      {/* Player filter */}
      {playerOptions.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Player</span>
          <button
            onClick={() => setFilterPlayer(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterPlayer === null ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
          >All</button>
          {playerOptions.map(p => (
            <button
              key={p.userId}
              onClick={() => setFilterPlayer(prev => prev === p.userId ? null : p.userId)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterPlayer === p.userId ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
            >{p.label}</button>
          ))}
        </div>
      )}

      {/* Queue filter */}
      {games.length > 0 && queues.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Queue</span>
          <button
            onClick={() => setFilterQueue(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterQueue === null ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
          >All</button>
          {queues.map(q => (
            <button
              key={q}
              onClick={() => setFilterQueue(filterQueue === q ? null : q)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterQueue === q ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
            >{q}</button>
          ))}
        </div>
      )}

      {/* My Colors filter */}
      {games.length > 0 && myColorOptions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20 flex-shrink-0">My Colors</span>
          {myColorOptions.map(k => (
            <button
              key={k}
              onClick={() => setFilterMyColors(prev => prev === k ? null : k)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full border transition-colors ${filterMyColors === k ? 'bg-gray-900 border-gray-900' : 'border-gray-300 hover:border-gray-500'}`}
            >
              {k.split('/').map(c => <InkImg key={c} color={c} size="w-5 h-5" />)}
            </button>
          ))}
        </div>
      )}

      {/* Opp Colors filter */}
      {games.length > 0 && oppColorOptions.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20 flex-shrink-0">Opp Colors</span>
          {oppColorOptions.map(k => (
            <button
              key={k}
              onClick={() => setFilterOppColors(prev => prev === k ? null : k)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full border transition-colors ${filterOppColors === k ? 'bg-gray-900 border-gray-900' : 'border-gray-300 hover:border-gray-500'}`}
            >
              {k.split('/').map(c => <InkImg key={c} color={c} size="w-5 h-5" />)}
            </button>
          ))}
        </div>
      )}

      {/* By Deck */}
      {deckStats.length > 1 && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">By Deck</div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {deckStats.map((stat) => {
              const { fp, colors, name, wins, losses, loreTotal, loreGames, latestDecklist } = stat
              const total = wins + losses
              const wr = total > 0 ? wins / total : null
              const avgLore = loreGames > 0 ? (loreTotal / loreGames).toFixed(1) : null
              const isSelected = filterDeck === fp
              const isExpanded = expandedDeckKey === fp
              return (
                <div
                  key={fp}
                  onClick={() => setFilterDeck(prev => prev === fp ? null : fp)}
                  className={`flex-shrink-0 text-left border rounded-lg px-3 py-2.5 cursor-pointer transition-colors min-w-[140px] ${isSelected ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-200 hover:border-gray-400 bg-white'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {colors.map(c => <InkImg key={c} color={c} size="w-5 h-5" />)}
                  </div>
                  {name && <div className={`text-[11px] font-medium truncate max-w-[130px] mb-1 ${isSelected ? 'text-gray-300' : 'text-gray-600'}`}>{name}</div>}
                  <div className={`text-sm font-bold ${isSelected ? 'text-white' : wr != null && wr >= 0.5 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {wins}–{losses}
                    {wr != null && <span className="ml-1.5 text-xs font-normal text-gray-400">{Math.round(wr * 100)}%</span>}
                  </div>
                  {avgLore && <div className="text-[11px] text-gray-400">{avgLore} avg lore</div>}
                  {latestDecklist?.length > 0 && (
                    <div
                      className={`flex gap-1.5 mt-2 pt-2 border-t ${isSelected ? 'border-gray-700' : 'border-gray-100'}`}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setExpandedDeckKey(prev => prev === fp ? null : fp)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${isExpanded ? (isSelected ? 'bg-gray-600 border-gray-500 text-white' : 'bg-gray-100 border-gray-300 text-gray-700') : (isSelected ? 'border-gray-600 text-gray-300 hover:border-gray-400' : 'border-gray-200 text-gray-500 hover:border-gray-400')}`}
                      >
                        Cards
                      </button>
                      <button
                        onClick={() => handleLoadInsights(stat)}
                        disabled={insightsLoading === fp}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-40 ${isSelected ? 'border-gray-600 text-gray-300 hover:border-gray-400' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
                      >
                        {insightsLoading === fp ? '…' : '→ Insights'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {expandedDeckKey && (() => {
            const stat = deckStats.find(d => d.fp === expandedDeckKey)
            if (!stat?.latestDecklist?.length) return null
            return (
              <div className="mt-3 border border-gray-200 rounded-lg bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{stat.name ?? 'Deck'}</span>
                    {stat.colors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
                  </div>
                  <button onClick={() => setExpandedDeckKey(null)} className="text-xs text-gray-400 hover:text-gray-700 ml-4 flex-shrink-0">✕</button>
                </div>
                <div className="p-4">
                  <DecklistDisplay decklist={stat.latestDecklist} cardIdToName={cardIdToName} />
                  <button
                    onClick={() => handleLoadInsights(stat)}
                    disabled={insightsLoading === stat.fp}
                    className="mt-4 text-xs px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-40"
                  >
                    {insightsLoading === stat.fp ? 'Loading…' : '→ Load into Deck Insights'}
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Stats overview */}
      {filteredGames.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Games</div>
            <div className="text-2xl font-bold text-gray-900">{filteredGames.length}</div>
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
              {filteredGames.length > 0 ? Math.round(filteredGames.reduce((sum, g) => sum + (g.turnCount || 0), 0) / filteredGames.length) : '—'}
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">MMR Range</div>
            <div className="text-base font-bold text-purple-600 leading-tight">{mmrRange ? `${mmrRange.low}–${mmrRange.peak}` : '—'}</div>
            <div className="text-xs text-gray-400 mt-0.5">{gamesWithMMR.length} games tracked</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Play Time</div>
            <div className="text-base font-bold text-gray-900 leading-tight">{Math.floor(totalPlayTime / 3600)}h {Math.floor((totalPlayTime % 3600) / 60)}m</div>
            <div className="text-xs text-gray-400 mt-0.5">{filteredGames.reduce((sum, g) => sum + (g.turnCount || 0), 0)} turns</div>
          </div>
        </div>
      )}


      {/* Overall Stats */}
      {enrichedGames.length > 0 && (
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
          {completeMatches.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">BO3 Matches</div>
              <div className="text-2xl font-bold text-gray-900">{matchWins}–{matchLosses}</div>
              <div className="text-xs text-gray-400 mt-0.5">{completeMatches.length} match{completeMatches.length !== 1 ? 'es' : ''}</div>
            </div>
          )}
        </div>
      )}

      {/* Turn Distribution */}
      {filteredGames.length > 0 && (
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
              <TurnDistributionView games={filteredGames} />
            </div>
          )}
        </div>
      )}

      {/* Win Rate Trend */}
      {filteredGames.length > 0 && (
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
              <WinRateTrendView games={filteredGames} />
            </div>
          )}
        </div>
      )}

      {/* MMR Trend */}
      {filteredGames.length > 0 && (
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
              <MMRTrendView games={filteredGames} />
            </div>
          )}
        </div>
      )}

      {/* Opponent Metagame */}
      {filteredGames.length > 0 && (
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
              <OpponentMetagameView games={filteredGames} />
            </div>
          )}
        </div>
      )}

      {/* Matchup Matrix */}
      {filteredGames.length > 0 && (
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
              <MatchupMatrixView games={filteredGames} />
            </div>
          )}
        </div>
      )}

      {/* Card Impact (WAR) */}
      {enrichedGames.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setCardImpactOpen(o => !o)}
            className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
          >
            <span className="text-xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Card Impact (WAR)</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${cardImpactOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {cardImpactOpen && (
            <div className="mt-6">
              <CardImpactView
                games={enrichedGames}
                deckSelected={filterDeck != null}
                deckVersions={selectedDeckId ? deckVersionsByDeckId[selectedDeckId] : null}
                hasToken={!!getToken()}
              />
            </div>
          )}
        </div>
      )}

      {/* Personal analysis — leaks, per-card stats, challenge stats. Overall/first-second/BO3
          win rate lives in the Overall Stats cards above, and opponent-matchup win rate in
          Opponent Metagame / Matchup Matrix below — avoids a third view of the same numbers. */}
      {enrichedGames.length > 0 && (
        <div className="mt-2">
          <LeakReport enrichedGames={enrichedGames} />
          {enrichedGames.length > 1 && (
            <>
              <DeckStats filteredGames={enrichedGames} subtitle={`Aggregated across ${enrichedGames.length} games`} />
              <ChallengeStats filteredGames={enrichedGames} subtitle={`Aggregated across ${enrichedGames.length} games`} />
            </>
          )}
        </div>
      )}

      {/* Single-game drilldown — click a game below (or in the lists further down) to open it */}
      {activeGamelog && (
        <div className="mb-4">
          <div className="flex items-center justify-between py-3 border-b-2 border-gray-200">
            <span className="text-xl font-bold text-gray-800">Game Detail</span>
            <button onClick={() => setActiveId(null)} className="text-xs text-gray-400 hover:text-gray-700">✕ Close</button>
          </div>
          <GamelogDetail gamelog={activeGamelog} myPlayerNum={activeMyPlayerNum} myName={myName} />
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
              <GamesList games={importedGames} userIdToLabel={userIdToLabel} activeId={activeId} onSelect={setActiveId} onDelete={async (id) => {
                await deleteGamelog(id)
                const newIds = new Set(importedIds)
                newIds.delete(id)
                setImportedIds(newIds)
                saveImportedGameIds(newIds)
                if (activeId === id) setActiveId(null)
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
              <GamesList games={personalGames} userIdToLabel={userIdToLabel} activeId={activeId} onSelect={setActiveId} onDelete={async (id) => {
                await deleteGamelog(id)
                if (activeId === id) setActiveId(null)
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

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllGamelogs, deleteGamelog, saveGamelog } from '../lib/gamelogHistory'
import { importGamesFromZip } from '../lib/gameImport'
import { analyzeOpponentMetagame } from '../lib/metagameAnalysis'
import { buildWinrateMatrixFromGames } from '../lib/buildWinrateMatrix'
import { computeCardImpact } from '../lib/cardImpact'
import { downloadGameIds } from '../lib/exportGameIds'
import { createGameExportZip } from '../lib/gameExport'
import { decompressGzip, parseGamelog } from '../lib/parseGamelog'
import { detectLeaks, summarizeLeaks, LEAK_TYPES } from '../lib/leakDetection'
import { fetchDecks, fetchPersonalStats, getToken, getTokens } from '../lib/duelsApi'
import { useCards } from '../hooks/useCards'

const MY_NAME_KEY = 'lorcana_my_name'
const REPLAY_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

function replayViewerUrl(replayUrl) {
  if (!replayUrl) return null
  const match = replayUrl.match(REPLAY_ID_RE)
  return match ? `https://duels.ink/replay/${match[1]}` : replayUrl
}

// --- Per-game enrichment for the personal analysis views below (win rate breakdowns,
// card stats, leak detection, single-game drilldown) — these need "my side" of the
// game resolved even for older gamelogs imported before myPlayerNum was reliably stored. ---

function getMyPlayerNum(gamelog, myName) {
  if (!myName?.trim()) return null
  const n = myName.trim().toLowerCase()
  if (gamelog.p1Name?.toLowerCase() === n) return 1
  if (gamelog.p2Name?.toLowerCase() === n) return 2
  if (gamelog.p1Name?.toLowerCase().includes(n)) return 1
  if (gamelog.p2Name?.toLowerCase().includes(n)) return 2
  return null
}

function enrichGame(gamelog, myName) {
  const myPlayerNum = gamelog.myPlayerNum ?? getMyPlayerNum(gamelog, myName)
  if (!myPlayerNum) return null

  const myP = myPlayerNum === 1 ? gamelog.p1 : gamelog.p2
  const opponentName = myPlayerNum === 1 ? gamelog.p2Name : gamelog.p1Name
  const won = gamelog.winner === myPlayerNum || gamelog.winner === String(myPlayerNum)

  const myCards = {}
  for (const [name, card] of Object.entries(myP.cards ?? {})) {
    myCards[name] = {
      fullName: name,
      name,
      id: card.id,
      playedCount: card.played ?? 0,
      inkedCount: card.inked ?? 0,
      loreGained: card.loreGained ?? 0,
      effectDraws: card.effectDraws ?? 0,
      oppForcedDiscards: card.oppForcedDiscards ?? 0,
      extraInks: card.extraInks ?? 0,
      effectRemovals: card.effectRemovals ?? 0,
      exerts: card.exerts ?? 0,
      cardsRecovered: card.cardsRecovered ?? 0,
      sings: card.sings ?? 0,
      oppRestrictions: card.oppRestrictions ?? 0,
      statModifiers: card.statModifiers ?? 0,
    }
  }

  const challenges = (gamelog.challenges ?? []).map(c => ({
    ...c,
    isMe: c.player === myPlayerNum,
  }))

  const iWentFirst = gamelog.wentFirst === myPlayerNum

  return {
    ...gamelog,
    myPlayerNum,
    opponentName,
    won,
    wentFirst: iWentFirst,
    victoryReason: gamelog.victoryReason ?? null,
    loreEvents: gamelog.loreEvents ?? [],
    myCards,
    challenges,
    myInkCombo: gamelog.myInkCombo ?? [],
    oppInkCombo: gamelog.oppInkCombo ?? [],
    mulligan: {
      openingHand: (myP.initialHand ?? []).map(c => ({ ...c, fullName: c.name })),
      sentBack: (myP.mulliganSent ?? []).map(c => ({ ...c, fullName: c.name })),
      kept: (myP.mulliganKept ?? []).map(c => ({ ...c, fullName: c.name })),
      replacements: (myP.mulliganDrawn ?? []).map(c => ({ ...c, fullName: c.name })),
      tookMulligan: (myP.mulliganSent?.length ?? 0) > 0,
      wentFirst: iWentFirst,
    },
  }
}

function aggregateMyCards(games) {
  const map = {}
  for (const game of games) {
    for (const card of Object.values(game.myCards ?? {})) {
      const key = card.fullName
      if (!map[key]) {
        map[key] = {
          fullName: key, name: key,
          playedCount: 0, inkedCount: 0, loreGained: 0,
          effectDraws: 0, oppForcedDiscards: 0, extraInks: 0, effectRemovals: 0, exerts: 0, cardsRecovered: 0, sings: 0, oppRestrictions: 0, statModifiers: 0,
        }
      }
      const m = map[key]
      m.playedCount += card.playedCount
      m.inkedCount += card.inkedCount
      m.loreGained += card.loreGained
      m.effectDraws += card.effectDraws
      m.oppForcedDiscards += card.oppForcedDiscards
      m.extraInks += card.extraInks
      m.effectRemovals += card.effectRemovals
      m.exerts += card.exerts ?? 0
      m.cardsRecovered += card.cardsRecovered ?? 0
      m.sings += card.sings ?? 0
      m.oppRestrictions += card.oppRestrictions ?? 0
      m.statModifiers += card.statModifiers ?? 0
    }
  }
  return Object.values(map)
}

function aggregateMulliganSentBack(games) {
  const map = {}
  for (const game of games) {
    const openingHand = game.mulligan?.openingHand ?? []
    const sentBack = game.mulligan?.sentBack ?? []
    const handCounts = {}
    for (const card of openingHand) {
      const key = card.fullName || card.name
      handCounts[key] = { key, count: (handCounts[key]?.count ?? 0) + 1 }
    }
    const sentBackCounts = {}
    for (const card of sentBack) {
      const key = card.fullName || card.name
      sentBackCounts[key] = (sentBackCounts[key] ?? 0) + 1
    }
    for (const [key, { count: inHand }] of Object.entries(handCounts)) {
      if (!map[key]) map[key] = { fullName: key, sentBackCount: 0, openingHandCount: 0 }
      map[key].openingHandCount++
      if ((sentBackCounts[key] ?? 0) >= inHand) map[key].sentBackCount++
    }
  }
  return Object.values(map)
}

// Cross-tabs each card's mulligan-keep status (kept in opening hand vs sent to bottom)
// against the game outcome, so we can compare win rate when a card is kept vs mulliganed.
// Counts games, not copies: a game where 2 copies of a card were kept counts once
// toward "kept" (not twice), and a game where one copy was kept while another copy
// of the same card was sent back counts once toward each side — genuinely mixed
// evidence, not double-counted evidence.
function aggregateMulliganWinRates(games) {
  const map = {}
  const bump = (key, status, won) => {
    if (!map[key]) map[key] = { fullName: key, keptWins: 0, keptLosses: 0, sentWins: 0, sentLosses: 0 }
    if (status === 'kept') won ? map[key].keptWins++ : map[key].keptLosses++
    else won ? map[key].sentWins++ : map[key].sentLosses++
  }
  for (const game of games) {
    const kept = game.mulligan?.kept ?? []
    const sentBack = game.mulligan?.sentBack ?? []
    const keptNames = new Set(kept.map(c => c.fullName || c.name))
    const sentNames = new Set(sentBack.map(c => c.fullName || c.name))
    for (const name of keptNames) bump(name, 'kept', game.won)
    for (const name of sentNames) bump(name, 'sent', game.won)
  }
  return Object.values(map)
}

function deckFingerprint(decklist) {
  if (!decklist) return null
  const cards = Array.isArray(decklist) ? decklist : Object.values(decklist)
  const key = cards
    .map(c => typeof c === 'string' ? c : `${c?.cardId ?? c?.name ?? c?.id ?? ''}x${c?.count ?? 1}`)
    .filter(s => s && s !== 'x1')
    .sort()
    .join('|')
  if (!key) return null
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0
  }
  return String(Math.abs(h))
}

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
  const dateFilteredGames = dateCutoff ? games.filter(g => (g.playedAt ?? g.savedAt) >= dateCutoff) : games

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

function DecklistDisplay({ decklist, cardIdToName }) {
  const entries = [...decklist].sort((a, b) =>
    b.count - a.count || (cardIdToName[a.cardId] ?? a.cardId).localeCompare(cardIdToName[b.cardId] ?? b.cardId)
  )
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5">
      {entries.map(({ cardId, count }) => (
        <div key={cardId} className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-xs text-gray-400 flex-shrink-0 w-4 text-right">{count}×</span>
          <span className="text-xs text-gray-800 truncate">{cardIdToName[cardId] ?? cardId}</span>
        </div>
      ))}
    </div>
  )
}

function GamesList({ games, userIdToLabel = {}, onDelete, activeId, onSelect }) {
  return (
    <div className="space-y-1">
      {games.map(g => (
        <GameListItem key={g.id} game={g} playerLabel={g.userId ? userIdToLabel[g.userId] : undefined} onDelete={onDelete} isActive={g.id === activeId} onSelect={onSelect} />
      ))}
    </div>
  )
}

function GameListItem({ game, playerLabel, onDelete, isActive, onSelect }) {
  const p1Name = game.p1Name || 'Player 1'
  const p2Name = game.p2Name || 'Player 2'
  const myNum = game.myPlayerNum
  const myDisplayLabel = playerLabel ?? (myNum === 1 ? p1Name : myNum === 2 ? p2Name : p1Name)
  const oppDisplayLabel = myNum === 1 ? p2Name : myNum === 2 ? p1Name : p2Name
  const myColors = game.myInkCombo ?? []
  const oppColors = game.oppInkCombo ?? []
  const won = myNum != null && (game.winner === myNum || game.winner === String(myNum))

  return (
    <div
      onClick={() => onSelect?.(game.id)}
      className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${onSelect ? 'cursor-pointer' : ''} ${isActive ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}
    >
      {myNum != null && (
        <span className={`text-[10px] font-bold w-6 text-center flex-shrink-0 ${isActive ? (won ? 'text-emerald-400' : 'text-red-400') : (won ? 'text-emerald-600' : 'text-red-500')}`}>
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
        <span className={`text-xs flex-shrink-0 ${isActive ? 'text-gray-400' : 'text-gray-400'}`}>vs</span>
        <span className="truncate">{oppDisplayLabel}</span>
        {oppColors.length > 0 && (
          <span className="flex items-center gap-0.5 flex-shrink-0">
            {oppColors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
          </span>
        )}
      </span>
      <span className={`text-xs flex-shrink-0 ${isActive ? 'opacity-60' : 'text-gray-400'}`}>{game.turnCount}T</span>
      <span className={`text-xs flex-shrink-0 ${isActive ? 'opacity-60' : 'text-gray-400'}`}>{new Date(game.playedAt ?? game.savedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
      <button
        onClick={(e) => { e.stopPropagation(); createGameExportZip([game], `lorcana-${game.id}`) }}
        className="text-xs opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
        title="Export game"
      >⬇</button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(game.id) }}
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

  const userDecks = Array.from(userDeckMap.values()).sort((a, b) => b.games - a.games)
  const oppDecks = Array.from(oppDeckMap.values()).sort((a, b) => b.games - a.games)

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
  const labelIdxs = [...new Set([0, Math.floor((sorted.length - 1) / 2), sorted.length - 1])]
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
  const labelIdxs = [...new Set([1, Math.max(1, Math.floor((totalPoints - 1) / 2)), totalPoints - 1])]
  const formatDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  // Grid lines — target ~4 labels max to avoid overlap
  const gridLines = []
  const rawStep = paddedRange / 4
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const gridStep = Math.max(1, [1, 2, 5, 10].map(m => m * magnitude).find(s => paddedRange / s <= 5) ?? magnitude * 10)
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

const MULLIGAN_MIN_SAMPLE = 2

function CardImpactView({ games, deckSelected, deckVersions, hasToken }) {
  const { results, totalGames } = computeCardImpact(games, { deckVersions })
  const scored = results.filter(r => r.war != null)

  const mulliganByCard = {}
  for (const m of aggregateMulliganWinRates(games)) {
    const keptTotal = m.keptWins + m.keptLosses
    const sentTotal = m.sentWins + m.sentLosses
    if (keptTotal === 0 && sentTotal === 0) continue
    mulliganByCard[m.fullName] = {
      keptPct: keptTotal > 0 ? Math.round((m.keptWins / keptTotal) * 100) : null,
      sentPct: sentTotal > 0 ? Math.round((m.sentWins / sentTotal) * 100) : null,
      keptTotal,
      sentTotal,
    }
  }

  return (
    <div>
      {!deckSelected && (
        <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Pick a deck above to compare like-for-like — mixing decks conflates deck strength with card strength.
        </div>
      )}
      {deckSelected && !hasToken && (
        <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Add a duels.ink API token on the Settings page to pull this deck's exact version history from duels.ink — without it, deck-cut detection falls back to the decklist recorded on each individual game (less complete).
        </div>
      )}
      <div className="text-xs text-gray-400 mb-4">
        For each card, wins in games it was drawn/played minus expected wins at the deck's baseline win rate in games without it — a rough "wins above replacement." Based on {totalGames} of your games with a recorded winner. A miss only counts toward "Games w/o" when we can confirm the card was actually in the 60 that game — preferably from duels.ink's own version history for this deck (each version's exact card list, matched to games by date), falling back to the decklist recorded on that individual game when version history isn't available. Misses that can't be confirmed either way, or that are confirmed as a cut card, are excluded so deck changes over time don't get held against a card (hover a "Games w/o" cell for the breakdown). Cards with fewer than 5 games on either side are low-confidence and shown faded. The "Kept % / Sent %" column shows win rate (with the game count in parens) in games this card was kept in your opening hand vs. sent back during mulligan, plus the difference in parentheses when both sides have data — a side shows "—" if you've never done that with this card. Counts are games, not copies: keeping 2 copies in one game still only counts once toward "kept," but a game where you kept one copy while sending another copy of the same card counts once toward each side, since that's genuinely mixed evidence (hover a cell for the full breakdown). A side under 2 games is low-confidence and shown faded.
      </div>
      {scored.length === 0 ? (
        <div className="text-sm text-gray-500">Not enough data yet — play or import more games with this deck.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200">
                <th className="py-2 pr-3">Card</th>
                <th className="py-2 px-3 text-right">WAR</th>
                <th className="py-2 px-3 text-right">WR w/</th>
                <th className="py-2 px-3 text-right">WR w/o</th>
                <th className="py-2 px-3 text-right">Games w/</th>
                <th className="py-2 px-3 text-right">Games w/o</th>
                <th className="py-2 pl-3 text-right">Kept % / Sent %</th>
              </tr>
            </thead>
            <tbody>
              {scored.map(r => {
                const mull = mulliganByCard[r.name]
                const mullDelta = (mull && mull.keptPct != null && mull.sentPct != null) ? mull.keptPct - mull.sentPct : null
                const mullLowSample = mull && (mull.keptTotal < MULLIGAN_MIN_SAMPLE || mull.sentTotal < MULLIGAN_MIN_SAMPLE)
                return (
                  <tr key={r.name} className={`border-b border-gray-100 ${r.lowSample ? 'opacity-40' : ''}`}>
                    <td className="py-1.5 pr-3 text-gray-800 truncate max-w-[280px]">{r.name}</td>
                    <td className={`py-1.5 px-3 text-right font-semibold ${r.war > 0 ? 'text-emerald-600' : r.war < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                      {r.war > 0 ? '+' : ''}{r.war.toFixed(1)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-gray-600">{Math.round(r.winRateWith * 100)}%</td>
                    <td className="py-1.5 px-3 text-right text-gray-600">{Math.round(r.winRateWithout * 100)}%</td>
                    <td className="py-1.5 px-3 text-right text-gray-400">{r.gamesWith}</td>
                    <td
                      className="py-1.5 px-3 text-right text-gray-400"
                      title={`${r.gamesNotInDeck} game${r.gamesNotInDeck !== 1 ? 's' : ''} confirmed not in deck · ${r.gamesUnknown} game${r.gamesUnknown !== 1 ? 's' : ''} with no recorded decklist — both excluded`}
                    >
                      {r.gamesWithout}
                    </td>
                    <td
                      className={`py-1.5 pl-3 text-right ${mullLowSample ? 'opacity-50' : ''}`}
                      title={mull
                        ? `Kept: ${mull.keptPct != null ? `${mull.keptPct}% (${mull.keptTotal} game${mull.keptTotal !== 1 ? 's' : ''})` : 'never kept'} · Sent: ${mull.sentPct != null ? `${mull.sentPct}% (${mull.sentTotal} game${mull.sentTotal !== 1 ? 's' : ''})` : 'never sent'}. A game where you kept one copy and sent another copy of the same card counts once toward each side.`
                        : 'No mulligan data recorded for this card'
                      }
                    >
                      {mull ? (
                        <>
                          <span className="text-gray-600">
                            {mull.keptPct != null ? `${mull.keptPct}%` : '—'}
                            <span className="text-[10px] text-gray-400">({mull.keptTotal})</span>
                            {' / '}
                            {mull.sentPct != null ? `${mull.sentPct}%` : '—'}
                            <span className="text-[10px] text-gray-400">({mull.sentTotal})</span>
                          </span>
                          {mullDelta != null && (
                            <> <span className={`font-semibold ${mullDelta > 0 ? 'text-emerald-600' : mullDelta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              ({mullDelta > 0 ? '+' : ''}{mullDelta})
                            </span></>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
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
              <div className="flex items-center gap-3 flex-shrink-0 text-sm ml-4">
                <span className="text-gray-600">{deck.gameCount}g</span>
                <span className={`font-medium w-12 text-right ${parseFloat(deck.winRate) >= 55 ? 'text-green-600' : parseFloat(deck.winRate) <= 45 ? 'text-red-500' : 'text-gray-500'}`}>{deck.winRate}% WR</span>
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

// --- Personal analysis components (win rate breakdowns, card/mulligan stats, leaks, single-game drilldown) ---

function Section({ title, subtitle, children, collapsible, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!collapsible) {
    return (
      <div className="mb-8">
        <div className="mb-3">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 border-b-2 border-gray-200 hover:border-gray-400 transition-colors group"
      >
        <div className="text-left">
          <span className="text-base font-bold text-gray-800 group-hover:text-gray-900 transition-colors">{title}</span>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-4 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

function StatTable({ rows, valueKey, emptyText }) {
  if (!rows.length) return <p className="text-sm text-gray-400">{emptyText}</p>
  return (
    <div className="font-mono text-sm space-y-0.5">
      {rows.map(c => (
        <div key={c.fullName} className="flex items-center gap-2 py-1 border-b border-gray-100 last:border-0">
          <span className="font-bold text-gray-900 w-8 text-right flex-shrink-0">{c[valueKey]}</span>
          <span className="flex-1 text-gray-700 truncate">{c.fullName}</span>
        </div>
      ))}
    </div>
  )
}

function MulliganTable({ rows, emptyText }) {
  if (!rows.length) return <p className="text-sm text-gray-400">{emptyText}</p>
  return (
    <div className="font-mono text-sm space-y-0.5">
      {rows.map(c => {
        const pct = c.openingHandCount > 0 ? Math.round((c.sentBackCount / c.openingHandCount) * 100) : 100
        return (
          <div key={c.fullName} className="flex items-center gap-2 py-1 border-b border-gray-100 last:border-0">
            <span className="font-bold text-gray-900 w-8 text-right flex-shrink-0">{c.sentBackCount}</span>
            <span className="flex-1 text-gray-700 truncate">{c.fullName}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

function DrawEffectsTable({ games }) {
  const cards = aggregateMyCards(games)
  const rows = cards
    .filter(c => (c.effectDraws + c.oppForcedDiscards + c.extraInks + c.effectRemovals + c.exerts + c.cardsRecovered + c.statModifiers) > 0)
    .sort((a, b) => {
      const score = c => c.effectDraws * 2 + c.oppForcedDiscards * 1.5 + c.extraInks + c.effectRemovals * 2 + c.exerts * 1.5 + c.cardsRecovered * 1.5 + c.statModifiers
      return score(b) - score(a)
    })
    .slice(0, 10)

  if (!rows.length) return <p className="text-sm text-gray-400">No effect data in these gamelogs.</p>

  return (
    <div className="text-sm">
      <div className="grid text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 gap-2" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem 3rem 3rem 3rem' }}>
        <span>Card</span>
        <span className="text-center text-blue-500">Draw</span>
        <span className="text-center text-purple-500">Discard</span>
        <span className="text-center text-amber-500">+Ink</span>
        <span className="text-center text-red-500">Remove</span>
        <span className="text-center text-orange-500">Exert</span>
        <span className="text-center text-teal-500">Recover</span>
        <span className="text-center text-pink-500">±Stat</span>
      </div>
      {rows.map(c => (
        <div key={c.fullName} className="grid items-center gap-2 py-1.5 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem 3rem 3rem 3rem' }}>
          <span className="text-gray-700 truncate">{c.fullName}</span>
          <span className="text-center font-semibold text-blue-500">{c.effectDraws || '—'}</span>
          <span className="text-center font-semibold text-purple-500">{c.oppForcedDiscards || '—'}</span>
          <span className="text-center font-semibold text-amber-500">{c.extraInks || '—'}</span>
          <span className="text-center font-semibold text-red-500">{c.effectRemovals || '—'}</span>
          <span className="text-center font-semibold text-orange-500">{c.exerts || '—'}</span>
          <span className="text-center font-semibold text-teal-500">{c.cardsRecovered || '—'}</span>
          <span className="text-center font-semibold text-pink-500">{c.statModifiers || '—'}</span>
        </div>
      ))}
      <p className="text-[10px] text-gray-400 mt-1.5">Draw = effect draws · Discard = forced opp discards · +Ink = extra ink · Remove = banished/inkwelled · Exert = opp exerted · Recover = from discard · ±Stat = stat buffs/debuffs</p>
    </div>
  )
}

function ImpactTable({ games, order }) {
  const cards = aggregateMyCards(games)

  const challengeMap = {}
  for (const c of games.flatMap(g => (g.challenges ?? []).filter(c => c.isMe && c.attackerName))) {
    if (!challengeMap[c.attackerName]) challengeMap[c.attackerName] = { kills: 0, survived: 0 }
    if (c.defenderBanished) challengeMap[c.attackerName].kills++
    if (!c.attackerBanished) challengeMap[c.attackerName].survived++
  }

  const scored = cards
    .filter(c => c.playedCount >= 3)
    .map(c => {
      const ch = challengeMap[c.fullName] ?? { kills: 0, survived: 0 }
      const impactScore =
        c.loreGained +
        c.effectDraws * 2 +
        c.oppForcedDiscards * 1.5 +
        c.extraInks +
        c.effectRemovals * 2 +
        c.exerts * 1.5 +
        c.cardsRecovered * 1.5 +
        c.statModifiers +
        c.sings * 1.5 +
        c.oppRestrictions * 2 +
        ch.kills * 2 +
        ch.survived * 0.5
      return { ...c, impactScore, ch }
    })

  const rows = (order === 'asc'
    ? scored.sort((a, b) => a.impactScore - b.impactScore || b.playedCount - a.playedCount)
    : scored.sort((a, b) => b.impactScore - a.impactScore || b.playedCount - a.playedCount)
  ).slice(0, 8)

  if (!rows.length) return <p className="text-sm text-gray-400">Not enough data (need 3+ plays per card).</p>

  return (
    <div className="font-mono text-sm space-y-0.5">
      {rows.map(c => {
        const tags = []
        if (c.loreGained > 0) tags.push(`${c.loreGained} lore`)
        if (c.effectDraws > 0) tags.push(`${c.effectDraws} draw`)
        if (c.oppForcedDiscards > 0) tags.push(`${c.oppForcedDiscards} discard`)
        if (c.extraInks > 0) tags.push(`${c.extraInks} +ink`)
        if (c.effectRemovals > 0) tags.push(`${c.effectRemovals} remove`)
        if (c.exerts > 0) tags.push(`${c.exerts} exert`)
        if (c.cardsRecovered > 0) tags.push(`${c.cardsRecovered} recover`)
        if (c.statModifiers > 0) tags.push(`${c.statModifiers} stat mod`)
        if (c.ch.kills > 0) tags.push(`${c.ch.kills} kills`)
        if (c.sings > 0) tags.push(`${c.sings} sings`)
        if (c.oppRestrictions > 0) tags.push(`${c.oppRestrictions} lock`)
        return (
          <div key={c.fullName} className="flex items-center gap-2 py-1 border-b border-gray-100 last:border-0">
            <span className="font-bold text-gray-900 w-8 text-right flex-shrink-0">{c.playedCount}</span>
            <span className="flex-1 text-gray-700 truncate">{c.fullName}</span>
            <span className="text-[10px] text-gray-400 flex-shrink-0 text-right whitespace-nowrap">
              {tags.length ? tags.join(' · ') : 'no impact tracked'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function DeckStats({ filteredGames, subtitle }) {
  const cards = aggregateMyCards(filteredGames)
  const mulliganCards = aggregateMulliganSentBack(filteredGames)

  const topPlayed = [...cards].filter(c => c.playedCount > 0).sort((a, b) => b.playedCount - a.playedCount).slice(0, 8)
  const topInked = [...cards].filter(c => c.inkedCount > 0).sort((a, b) => b.inkedCount - a.inkedCount).slice(0, 8)
  const topLore = [...cards].filter(c => c.loreGained > 0).sort((a, b) => b.loreGained - a.loreGained).slice(0, 8)
  const topSentBack = [...mulliganCards].filter(c => c.sentBackCount > 0).sort((a, b) => b.sentBackCount - a.sentBackCount).slice(0, 8)

  return (
    <Section collapsible defaultOpen title="Card Stats" subtitle={subtitle}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-1">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Most Played</h3>
          <StatTable rows={topPlayed} valueKey="playedCount" emptyText="No plays recorded." />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Most Inked</h3>
          <StatTable rows={topInked} valueKey="inkedCount" emptyText="No inks recorded." />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Most Lore Gained</h3>
          <StatTable rows={topLore} valueKey="loreGained" emptyText="No quest data in these gamelogs." />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Most Mulliganed</h3>
          <p className="text-[10px] text-gray-400 mb-1.5">Games fully mulliganed · % of games card was in opening hand</p>
          <MulliganTable rows={topSentBack} emptyText="No mulligan data." />
        </div>
      </div>
      {filteredGames.length > 1 && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Card Effects</h3>
          <DrawEffectsTable games={filteredGames} />
        </div>
      )}
      {filteredGames.length > 1 && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Most Impactful Cards</h3>
              <p className="text-[10px] text-gray-400 mb-2">Plays · score: lore + draws + kills + removal + sings</p>
              <ImpactTable games={filteredGames} order="desc" />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Least Impactful Cards</h3>
              <p className="text-[10px] text-gray-400 mb-2">Plays · score: lore + draws + kills + removal + sings</p>
              <ImpactTable games={filteredGames} order="asc" />
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}

function CrossGameChallengers({ games }) {
  const mine = games.flatMap(g => (g.challenges ?? []).filter(c => c.isMe))
  if (!mine.length) return null

  const map = {}
  for (const c of mine) {
    const key = c.attackerName
    if (!key) continue
    if (!map[key]) map[key] = { name: key, challenged: 0, survived: 0, traded: 0, banishedNoKill: 0 }
    map[key].challenged++
    if (!c.attackerBanished) map[key].survived++
    else if (c.defenderBanished) map[key].traded++
    else map[key].banishedNoKill++
  }

  const rows = Object.values(map).filter(r => r.challenged >= 2).sort((a, b) => b.challenged - a.challenged)
  if (!rows.length) return null

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Challenger Stats</h3>
      <div className="text-sm">
        <div className="grid text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 gap-2" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem 4rem' }}>
          <span>Character</span>
          <span className="text-center">Total</span>
          <span className="text-center text-emerald-600">Survived</span>
          <span className="text-center text-yellow-600">Traded</span>
          <span className="text-center text-red-500">No kill</span>
          <span className="text-right text-emerald-600">Surv%</span>
        </div>
        {rows.map(r => {
          const pct = Math.round((r.survived / r.challenged) * 100)
          return (
            <div key={r.name} className="grid items-center gap-2 py-1.5 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem 4rem' }}>
              <span className="text-gray-800 truncate">{r.name}</span>
              <span className="text-center font-bold text-gray-700">{r.challenged}</span>
              <span className="text-center font-semibold text-emerald-600">{r.survived || '—'}</span>
              <span className="text-center font-semibold text-yellow-600">{r.traded || '—'}</span>
              <span className="text-center font-semibold text-red-500">{r.banishedNoKill || '—'}</span>
              <span className={`text-xs font-bold text-right ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-gray-600' : 'text-red-500'}`}>{pct}%</span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">Cards with 2+ challenges shown · Surv% = attacker survived</p>
    </div>
  )
}

function CrossGameDefenders({ games }) {
  const opp = games.flatMap(g => (g.challenges ?? []).filter(c => !c.isMe))
  if (!opp.length) return null

  const map = {}
  for (const c of opp) {
    const key = c.defenderName
    if (!key) continue
    if (!map[key]) map[key] = { name: key, seq: [] }
    map[key].seq.push(c)
  }

  const rows = Object.values(map).map(({ name, seq }) => {
    let hits = 0, tanked = 0, killedInOne = 0, killedMultiple = 0
    for (const c of seq) {
      hits++
      if (c.defenderBanished) {
        if (hits === 1) killedInOne++
        else killedMultiple++
        hits = 0
      } else {
        tanked++
      }
    }
    return { name, timesTargeted: seq.length, tanked, killedInOne, killedMultiple }
  }).filter(r => r.timesTargeted >= 2).sort((a, b) => b.timesTargeted - a.timesTargeted)

  if (!rows.length) return null

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Your Characters as Defenders</h3>
      <div className="text-sm">
        <div className="grid text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 gap-2" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem' }}>
          <span>Character</span>
          <span className="text-center">Targeted</span>
          <span className="text-center text-emerald-600">Tanked</span>
          <span className="text-center text-yellow-600">1-shot</span>
          <span className="text-center text-red-500">Multi</span>
        </div>
        {rows.map(r => (
          <div key={r.name} className="grid items-center gap-2 py-1.5 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem' }}>
            <span className="text-gray-800 truncate">{r.name}</span>
            <span className="text-center font-bold text-gray-700">{r.timesTargeted}</span>
            <span className="text-center font-semibold text-emerald-600">{r.tanked || '—'}</span>
            <span className="text-center font-semibold text-yellow-600">{r.killedInOne || '—'}</span>
            <span className="text-center font-semibold text-red-500">{r.killedMultiple || '—'}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">Targeted 2+ times · Tanked = survived · 1-shot = banished in one · Multi = required 2+</p>
    </div>
  )
}

function ChallengeStats({ filteredGames, subtitle }) {
  const hasChallenges = filteredGames.some(g => (g.challenges ?? []).length > 0)
  if (!hasChallenges) return null
  return (
    <Section collapsible defaultOpen title="Challenge Stats" subtitle={subtitle}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-1">
        <CrossGameChallengers games={filteredGames} />
        <CrossGameDefenders games={filteredGames} />
      </div>
    </Section>
  )
}

function InkImg({ color, size = 'w-4 h-4' }) {
  if (!color) return null
  const name = color.toLowerCase()
  const VALID = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel']
  if (!VALID.includes(name)) return null
  return <img src={`/ink/${name}.png`} alt={name} title={name} className={`${size} flex-shrink-0`} />
}

// --- Leak / mistake detection ---

const SEVERITY_STYLE = {
  high: { dot: 'bg-red-500', text: 'text-red-600', label: 'High' },
  medium: { dot: 'bg-amber-500', text: 'text-amber-600', label: 'Medium' },
  low: { dot: 'bg-gray-400', text: 'text-gray-500', label: 'Low' },
}

function LeakReport({ enrichedGames }) {
  const [expanded, setExpanded] = useState(null)
  const summary = summarizeLeaks(enrichedGames)
  if (!summary.ranked.length) {
    return (
      <Section collapsible defaultOpen title="Leaks & Mistakes" subtitle="Recurring tendencies that cost you games">
        <p className="text-sm text-gray-400">
          No leaks detected across {summary.analyzed} game{summary.analyzed !== 1 ? 's' : ''} — clean play, or not enough signal yet. Import more games for a fuller picture.
        </p>
      </Section>
    )
  }

  return (
    <Section collapsible defaultOpen title="Leaks & Mistakes" subtitle={`Top tendencies across ${summary.analyzed} game${summary.analyzed !== 1 ? 's' : ''} · review, don't take as gospel`}>
      <div className="space-y-2">
        {summary.ranked.map(leak => {
          const meta = LEAK_TYPES[leak.type] ?? { label: leak.type }
          const isOpen = expanded === leak.type
          const wr = leak.winRateWhenPresent
          const games = leak.winsWhenPresent + leak.lossesWhenPresent
          const instances = summary.results
            .map(r => ({ game: r.game, leak: r.res.leaks.find(l => l.type === leak.type) }))
            .filter(x => x.leak)
          return (
            <div key={leak.type} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : leak.type)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{meta.label}</span>
                    <span className="text-xs text-gray-400">{leak.gamesAffected}/{summary.analyzed} games</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{meta.blurb}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {wr != null && games > 0 && (
                    <div className={`text-sm font-bold ${wr < summary.overallWinRate ? 'text-red-500' : 'text-gray-600'}`}>
                      {Math.round(wr * 100)}%
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400">win rate when present</div>
                </div>
                <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50">
                  <div className="text-xs text-gray-600 mb-3 mt-2">
                    <span className="font-semibold text-gray-700">How to fix: </span>{meta.tip}
                  </div>
                  {wr != null && wr < summary.overallWinRate && (
                    <p className="text-[11px] text-red-500 mb-3">
                      You win {Math.round(wr * 100)}% of games with this leak vs {Math.round(summary.overallWinRate * 100)}% overall — a {Math.round((summary.overallWinRate - wr) * 100)}-point drop.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {instances.map(({ game, leak: gl }) => {
                      const sev = SEVERITY_STYLE[gl.severity] ?? SEVERITY_STYLE.low
                      return (
                        <div key={game.id} className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${sev.dot}`} />
                            <span className="font-medium text-gray-700">
                              vs {game.opponentName || 'Unknown'}
                              {game.oppInkCombo?.length > 0 && ` (${game.oppInkCombo.map(c => c[0].toUpperCase() + c.slice(1)).join('/')})`}
                            </span>
                            <span className={`text-[10px] font-semibold ${game.won ? 'text-emerald-600' : 'text-red-500'}`}>
                              {game.won ? 'W' : 'L'}
                            </span>
                          </div>
                          <div className="ml-3.5 text-gray-500">
                            {gl.instances.map((inst, i) => (
                              <div key={i}>{inst.text}</div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-3">
        Leaks are inferred from log data without full hand knowledge — treat them as patterns to review, not certain mistakes.
      </p>
    </Section>
  )
}

function GameLeaks({ gamelog, myPlayerNum }) {
  if (myPlayerNum == null) return null
  const { leaks } = detectLeaks(gamelog, myPlayerNum)
  if (!leaks.length) return null
  return (
    <div className="mt-6 border border-gray-100 rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Leaks This Game</h3>
      <div className="space-y-2.5">
        {leaks.map(leak => {
          const meta = LEAK_TYPES[leak.type] ?? { label: leak.type }
          const sev = SEVERITY_STYLE[leak.severity] ?? SEVERITY_STYLE.low
          return (
            <div key={leak.type} className="text-sm">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} />
                <span className="font-semibold text-gray-800">{meta.label}</span>
                <span className={`text-[10px] font-semibold uppercase ${sev.text}`}>{sev.label}</span>
              </div>
              <div className="ml-4 mt-0.5 text-xs text-gray-500 space-y-0.5">
                {leak.instances.map((inst, i) => (
                  <div key={i}>{inst.text}</div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-3">Inferred from the log — patterns to review, not certain mistakes.</p>
    </div>
  )
}

// --- Individual game view ---

function HandCards({ cards, label }) {
  if (!cards?.length) return null
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {cards.map((c, i) => (
          <span key={i} className="text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5">{c.name}</span>
        ))}
      </div>
    </div>
  )
}

function PlayerSection({ name, data, isWinner, finalLore }) {
  const { initialHand, mulliganSent, mulliganKept, cardList } = data
  const mulliganDrawn = data.mulliganDrawn ?? []
  const tookMulligan = mulliganSent.length > 0
  const anyDiscarded = cardList.some(c => c.discarded > 0)
  const anyDestroyed = cardList.some(c => c.destroyed > 0)
  const anyLore = cardList.some(c => (c.loreGained ?? 0) > 0)

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h2 className="text-base font-bold text-gray-900">{name}</h2>
        {isWinner && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">Winner</span>}
        {finalLore != null && <span className="text-xs text-gray-500">{finalLore} lore</span>}
      </div>

      <div className="space-y-3 mb-5">
        <HandCards cards={initialHand} label="Opening hand" />
        {tookMulligan ? (
          <>
            <HandCards cards={mulliganSent} label="Sent back" />
            <HandCards cards={mulliganKept} label="Kept" />
            <HandCards cards={mulliganDrawn} label="Drew as replacements" />
          </>
        ) : initialHand.length > 0 ? (
          <div className="text-xs text-gray-400">Kept opening hand</div>
        ) : null}
      </div>

      {cardList.length > 0 && (
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-1.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Card</th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Drawn</th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Played</th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Inked</th>
              {anyLore && <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Lore</th>}
              {anyDiscarded && <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Discarded</th>}
              {anyDestroyed && <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Destroyed</th>}
            </tr>
          </thead>
          <tbody>
            {cardList.map(card => (
              <tr key={card.name} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-1.5 pr-4 font-medium text-gray-800 text-sm">{card.name}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.drawn || '—'}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.played || '—'}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.inked || '—'}</td>
                {anyLore && <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.loreGained || '—'}</td>}
                {anyDiscarded && <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.discarded || '—'}</td>}
                {anyDestroyed && <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.destroyed || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LoreChart({ loreEvents, turnCount, p1Name, p2Name }) {
  if (!loreEvents?.length) return null

  const maxTurn = Math.max(turnCount, ...loreEvents.map(e => e.turn))
  const p1Lore = new Array(maxTurn + 1).fill(0)
  const p2Lore = new Array(maxTurn + 1).fill(0)

  for (const ev of loreEvents) {
    if (ev.player === 1) p1Lore[ev.turn] = ev.total
    else p2Lore[ev.turn] = ev.total
  }
  for (let t = 1; t <= maxTurn; t++) {
    if (p1Lore[t] === 0 && p1Lore[t - 1] > 0) p1Lore[t] = p1Lore[t - 1]
    if (p2Lore[t] === 0 && p2Lore[t - 1] > 0) p2Lore[t] = p2Lore[t - 1]
  }

  const maxLore = Math.max(20, ...p1Lore, ...p2Lore)
  const W = 480, H = 120, PAD = { top: 8, right: 8, bottom: 20, left: 28 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const turns = Array.from({ length: maxTurn + 1 }, (_, i) => i)

  const x = (t) => PAD.left + (t / maxTurn) * chartW
  const y = (v) => PAD.top + chartH - (v / maxLore) * chartH

  const pathFor = (arr) => arr.map((v, t) => `${t === 0 ? 'M' : 'L'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  const winY = y(20)

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Lore Race</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 140 }}>
        {[0, 5, 10, 15, 20].map(v => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth="0.5" />
            <text x={PAD.left - 4} y={y(v) + 3.5} textAnchor="end" fontSize="7" fill="#9ca3af">{v}</text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={winY} y2={winY} stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />

        <path d={pathFor(p2Lore)} fill="none" stroke="#f87171" strokeWidth="2" strokeLinejoin="round" />
        <path d={pathFor(p1Lore)} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />

        {turns.filter(t => t > 0 && t % Math.max(1, Math.floor(maxTurn / 8)) === 0).map(t => (
          <text key={t} x={x(t)} y={H - 4} textAnchor="middle" fontSize="7" fill="#9ca3af">{t}</text>
        ))}
        <text x={PAD.left + chartW / 2} y={H - 4} textAnchor="middle" fontSize="7" fill="#d1d5db">turn</text>
      </svg>
      <div className="flex items-center gap-4 mt-1">
        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="inline-block w-3 h-0.5 bg-blue-400" />{p1Name}</span>
        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="inline-block w-3 h-0.5 bg-red-400" />{p2Name}</span>
        <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto"><span className="inline-block w-3 h-0.5 border-t border-dashed border-emerald-500" />win (20)</span>
      </div>
    </div>
  )
}

function GameChallengeLog({ challenges, myPlayerNum }) {
  if (!challenges?.length) return null
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Challenges ({challenges.length})</h3>
      <div className="space-y-0.5 text-xs font-mono">
        {challenges.map((c, i) => {
          const isMe = c.player === myPlayerNum
          return (
            <div key={i} className={`flex items-center gap-2 py-1 border-b border-gray-100 last:border-0 ${isMe ? '' : 'opacity-60'}`}>
              <span className="text-gray-400 w-12 flex-shrink-0">T{c.turn} {isMe ? '▶' : '◀'}</span>
              <span className="font-medium text-gray-800 truncate flex-1">{c.attackerName ?? '?'}</span>
              <span className="text-gray-400">→</span>
              <span className="text-gray-700 truncate flex-1">{c.defenderName ?? '?'}</span>
              <span className={`flex-shrink-0 font-semibold ${c.defenderBanished ? 'text-emerald-600' : 'text-gray-400'}`}>
                {c.defenderBanished ? 'kill' : 'miss'}
              </span>
              <span className={`flex-shrink-0 ${c.attackerBanished ? 'text-red-400' : 'text-gray-400'}`}>
                {c.attackerBanished ? '✕' : '✓'}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1">▶ = your challenge · ▶ kill = defender banished · ✕ = attacker banished</p>
    </div>
  )
}

function OppDecklistView({ oppDecklist, isInferred, oppCards }) {
  const seen = new Set()
  const rows = []

  if (oppDecklist?.length) {
    for (const { cardId, count } of oppDecklist) {
      if (!seen.has(cardId)) {
        seen.add(cardId)
        const name = Object.values(oppCards ?? {}).find(c => c.id === cardId)?.name ?? cardId
        rows.push({ cardId, name, count, seen: Object.values(oppCards ?? {}).find(c => c.id === cardId) != null })
      }
    }
  }

  for (const card of Object.values(oppCards ?? {})) {
    if (!rows.find(r => r.name === card.name)) {
      rows.push({ cardId: card.id, name: card.name, count: null, seen: true })
    }
  }

  if (!rows.length) return null

  rows.sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Opponent Decklist</h3>
        {isInferred && <span className="text-[10px] text-gray-400">(inferred from gamelog — counts are minimums)</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 text-xs font-mono">
        {rows.map(r => (
          <div key={r.cardId} className={`flex items-center gap-1.5 py-0.5 border-b border-gray-50 ${r.seen ? 'text-gray-800' : 'text-gray-400'}`}>
            <span className="w-5 text-right flex-shrink-0 font-semibold">{isInferred && r.count != null ? `≥${r.count}` : (r.count ?? '?')}</span>
            <span className="truncate">{r.name}</span>
            {r.seen && <span className="text-emerald-500 flex-shrink-0 ml-auto">●</span>}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-1">● = observed in game</p>
    </div>
  )
}

function resolveDisplayName(storedName, isMe, myName) {
  if (storedName !== 'Player 1' && storedName !== 'Player 2') return storedName
  if (isMe && myName) return myName
  return storedName
}

function RawStructureInspector({ rawLogs }) {
  if (!rawLogs || rawLogs.length === 0) return null

  const gameStart = rawLogs.find(l => l.type === 'GAME_START')
  const gameEnd = rawLogs.find(l => l.type === 'GAME_END')
  const firstCardDrawn = rawLogs.find(l => l.type === 'CARD_DRAWN')
  const firstMulligan = rawLogs.find(l => l.type === 'MULLIGAN')
  const firstThree = rawLogs.slice(0, 3)

  const uniqueTypes = [...new Set(rawLogs.map(l => l.type))].sort()

  const copyRawLog = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(rawLogs))
    } catch {
      // Clipboard blocked — fall through to the download button instead.
    }
  }

  const downloadRawLog = () => {
    const blob = new Blob([JSON.stringify(rawLogs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gamelog-raw.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <details className="border border-dashed border-gray-300 rounded-lg p-4 text-xs text-gray-600 mb-6">
      <summary className="cursor-pointer font-medium text-gray-700 select-none">Raw structure inspector</summary>
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-700">Full raw log ({rawLogs.length} events):</span>
          <button
            onClick={copyRawLog}
            className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900 transition-colors"
          >Copy JSON</button>
          <button
            onClick={downloadRawLog}
            className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900 transition-colors"
          >Download .json</button>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Event types ({uniqueTypes.length}): </span>
          <span className="font-mono">{uniqueTypes.join(', ')}</span>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">GAME_START entry (player names, setup):</div>
          <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(gameStart ?? 'none — no GAME_START event found', null, 2)}
          </pre>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">GAME_END entry (winner, final lore):</div>
          <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(gameEnd ?? 'none', null, 2)}
          </pre>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">First CARD_DRAWN entry:</div>
          <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(firstCardDrawn ?? 'none — no CARD_DRAWN events found', null, 2)}
          </pre>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">First MULLIGAN entry:</div>
          <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(firstMulligan ?? 'none', null, 2)}
          </pre>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">First 3 raw entries (top-level structure):</div>
          <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(firstThree, null, 2)}
          </pre>
        </div>
      </div>
    </details>
  )
}

function TurnByTurnLog({ rawLogs, turnCount }) {
  if (!rawLogs || rawLogs.length === 0) return null

  const eventsByTurn = {}
  for (let i = 1; i <= (turnCount || 20); i++) {
    eventsByTurn[i] = []
  }
  for (const log of rawLogs) {
    const turn = log.turnNumber ?? 0
    if (turn > 0) {
      if (!eventsByTurn[turn]) eventsByTurn[turn] = []
      eventsByTurn[turn].push(log)
    }
  }

  const turns = Object.entries(eventsByTurn).filter(([, events]) => events.length > 0)

  if (turns.length === 0) return null

  return (
    <div className="border border-gray-100 rounded-lg p-4 mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Turn-by-Turn Events</h3>
      <div className="space-y-2">
        {turns.map(([turn, events]) => (
          <details key={turn} className="border border-gray-200 rounded p-2">
            <summary className="cursor-pointer font-medium text-sm text-gray-700 select-none">
              Turn {turn} ({events.length} events)
            </summary>
            <div className="mt-2 space-y-1">
              {events.map((event, idx) => (
                <div key={idx} className="text-xs text-gray-600 ml-2 py-0.5 border-l-2 border-gray-200 pl-2">
                  <span className="font-semibold text-gray-700">{event.type}</span>
                  {event.player && <span className="text-gray-500"> (P{event.player})</span>}
                  {event.data?.cardName && <span className="text-gray-700 font-mono"> — {event.data.cardName}</span>}
                  {event.data?.loreGained && <span className="text-emerald-600"> +{event.data.loreGained} lore</span>}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

function CardEffectsTimeline({ p1, p2, p1Name, p2Name, turnCount }) {
  if (!turnCount || ((!p1?.cards || Object.keys(p1.cards).length === 0) && (!p2?.cards || Object.keys(p2.cards).length === 0))) {
    return null
  }

  const renderPlayerTimeline = (player, playerName) => {
    if (!player?.cards || Object.keys(player.cards).length === 0) return null

    const cardsArray = Object.values(player.cards)

    const turnsPerCard = {}
    for (const card of cardsArray) {
      turnsPerCard[card.name] = {
        drawn: Math.ceil((card.drawn || 0) / Math.max(turnCount / 3, 1)),
        played: Math.ceil((card.played || 0) / Math.max(turnCount / 3, 1)),
        inked: Math.ceil((card.inked || 0) / Math.max(turnCount / 3, 1)),
      }
    }

    return (
      <div key={playerName} className="mb-4">
        <h4 className="text-xs font-semibold text-gray-600 mb-2">{playerName}</h4>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {cardsArray.slice(0, 10).map(card => (
            <div key={card.name} className="text-xs text-gray-700">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="truncate font-medium flex-1">{card.name}</span>
              </div>
              <div className="flex gap-2 text-[11px]">
                {card.drawn > 0 && <span className="text-blue-600">↓{card.drawn}</span>}
                {card.played > 0 && <span className="text-amber-600">▶{card.played}</span>}
                {card.inked > 0 && <span className="text-purple-600">◆{card.inked}</span>}
                {card.discarded > 0 && <span className="text-gray-500">✕{card.discarded}</span>}
              </div>
            </div>
          ))}
          {cardsArray.length > 10 && (
            <div className="text-xs text-gray-400 mt-2">+{cardsArray.length - 10} more cards</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-100 rounded-lg p-4 mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Card Effects Timeline</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderPlayerTimeline(p1, p1Name)}
        {renderPlayerTimeline(p2, p2Name)}
      </div>
      <div className="text-[11px] text-gray-500 mt-2 space-y-0.5">
        <div>↓ = Drawn · ▶ = Played · ◆ = Inked · ✕ = Discarded</div>
      </div>
    </div>
  )
}

function GamelogDetail({ gamelog, myPlayerNum, myName = '' }) {
  const { p1Name: rawP1Name, p2Name: rawP2Name, winner, turnCount, p1FinalLore, p2FinalLore, p1, p2, victoryReason, wentFirst, loreEvents, challenges, oppDecklist, inferredOppDecklist, savedAt, _rawLogs } = gamelog
  const p1Name = resolveDisplayName(rawP1Name, myPlayerNum === 1, myName)
  const p2Name = resolveDisplayName(rawP2Name, myPlayerNum === 2, myName)
  const p1IsWinner = winner === 1 || winner === '1'
  const p2IsWinner = winner === 2 || winner === '2'
  const winnerName = p1IsWinner ? p1Name : p2IsWinner ? p2Name : null
  const myWon = myPlayerNum != null && (winner === myPlayerNum || winner === String(myPlayerNum))

  const metaBits = []
  if (gamelog.deckName) metaBits.push(gamelog.deckName)
  if (gamelog.match_format === 'bo3' && gamelog.match_game_number) {
    metaBits.push(`Game ${gamelog.match_game_number} of BO3`)
  }
  if (turnCount) metaBits.push(`${turnCount} turns`)
  if (wentFirst != null) {
    const firstName = wentFirst === 1 ? p1Name : p2Name
    metaBits.push(`${firstName} went first`)
  }
  if (victoryReason && victoryReason !== 'normal') metaBits.push(victoryReason)
  const displayTime = gamelog.playedAt ?? savedAt
  if (displayTime) metaBits.push(new Date(displayTime).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }))

  const oppP = myPlayerNum === 1 ? p2 : myPlayerNum === 2 ? p1 : null

  return (
    <div className="mt-2">
      <div className="border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h2 className="text-lg font-bold text-gray-900">{p1Name} vs {p2Name}</h2>
          {winnerName && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">
              {winnerName} wins
            </span>
          )}
          {myPlayerNum != null && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${myWon ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
              {myWon ? 'Win' : 'Loss'}
            </span>
          )}
          {gamelog.replay_url && (
            <a
              href={replayViewerUrl(gamelog.replay_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
            >
              ↗ Watch Replay
            </a>
          )}
        </div>
        <div className="text-sm text-gray-500">{metaBits.join(' · ')}</div>
      </div>

      {/* Raw structure inspector */}
      <RawStructureInspector rawLogs={_rawLogs} />

      {/* Lore Race */}
      {loreEvents?.length > 0 && (
        <div className="border border-gray-100 rounded-lg p-4 mb-6">
          <LoreChart loreEvents={loreEvents} turnCount={turnCount} p1Name={p1Name} p2Name={p2Name} />
        </div>
      )}

      {/* Turn-by-Turn Log */}
      <TurnByTurnLog rawLogs={_rawLogs} turnCount={turnCount} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div>
          {myPlayerNum === 1 && (
            <div className="inline-flex items-center text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded mb-2">You</div>
          )}
          <PlayerSection name={p1Name} data={p1} isWinner={p1IsWinner} finalLore={p1FinalLore} />
        </div>
        <div>
          {myPlayerNum === 2 && (
            <div className="inline-flex items-center text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded mb-2">You</div>
          )}
          <PlayerSection name={p2Name} data={p2} isWinner={p2IsWinner} finalLore={p2FinalLore} />
        </div>
      </div>

      {/* Leaks this game */}
      <GameLeaks gamelog={gamelog} myPlayerNum={myPlayerNum} />

      {/* Card Effects Timeline */}
      <CardEffectsTimeline p1={p1} p2={p2} p1Name={p1Name} p2Name={p2Name} turnCount={turnCount} />

      {/* Challenge log */}
      {challenges?.length > 0 && (
        <div className="mt-8 border border-gray-100 rounded-lg p-4">
          <GameChallengeLog challenges={challenges} myPlayerNum={myPlayerNum} />
        </div>
      )}

      {/* Opponent decklist */}
      {((oppDecklist ?? inferredOppDecklist)?.length > 0 || (oppP && Object.keys(oppP.cards ?? {}).length > 0)) && (
        <div className="mt-6 border border-gray-100 rounded-lg p-4">
          <OppDecklistView
            oppDecklist={oppDecklist ?? inferredOppDecklist}
            isInferred={!oppDecklist && !!inferredOppDecklist}
            oppCards={oppP?.cards}
          />
        </div>
      )}
    </div>
  )
}

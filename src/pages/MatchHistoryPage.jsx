import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getToken, getTokens, getActiveTokenId, setTokenUserId, fetchMatchHistory, fetchGamelogBuffer, fetchDecks, fetchDeck } from '../lib/duelsApi'
import { saveGamelog } from '../lib/gamelogHistory'
import { decompressGzip, parseGamelog } from '../lib/parseGamelog'
import { useCards } from '../hooks/useCards'
import { InkIcons as SharedInkIcons } from '../components/InkIcons'

const DECK_NAMES_KEY = 'lorcana_deck_names'
const DECK_DETAILS_KEY = 'lorcana_deck_details'
const DELETED_DECKS_KEY = 'lorcana_deleted_deck_ids'

function getDeletedDeckIds() {
  try { return new Set(JSON.parse(localStorage.getItem(DELETED_DECKS_KEY) ?? '[]')) } catch { return new Set() }
}
function markDeckDeleted(id) {
  const ids = getDeletedDeckIds()
  ids.add(id)
  localStorage.setItem(DELETED_DECKS_KEY, JSON.stringify([...ids]))
}

function DeckCardList({ cardIds, cardIdToName }) {
  const counts = {}
  for (const id of cardIds) counts[id] = (counts[id] ?? 0) + 1
  const entries = Object.entries(counts).sort((a, b) =>
    b[1] - a[1] || (cardIdToName[a[0]] ?? a[0]).localeCompare(cardIdToName[b[0]] ?? b[0])
  )
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5">
      {entries.map(([id, count]) => (
        <div key={id} className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-xs text-gray-400 flex-shrink-0 w-4 text-right">{count}×</span>
          <span className="text-xs text-gray-800 truncate" title={id}>{cardIdToName[id] ?? id}</span>
        </div>
      ))}
    </div>
  )
}

function isDeckModified(latestDecklist, apiCardIds) {
  if (!latestDecklist?.length || !apiCardIds?.length) return false
  const gameCounts = {}
  for (const { cardId, count } of latestDecklist) gameCounts[cardId] = (gameCounts[cardId] ?? 0) + (count ?? 1)
  const apiCounts = {}
  for (const id of apiCardIds) apiCounts[id] = (apiCounts[id] ?? 0) + 1
  const toSig = obj => Object.entries(obj).sort().map(([k, v]) => `${k}:${v}`).join('|')
  return toSig(gameCounts) !== toSig(apiCounts)
}

function deckFingerprint(decklist) {
  if (!decklist) return null
  const cards = Array.isArray(decklist) ? decklist : Object.values(decklist)
  // Each entry is { cardId, count } — include count so a different card quantity = different deck
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

function formatDate(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).replace(',', ' ·')
}

function ResultBadge({ result }) {
  if (!result) return <span className="text-gray-400">—</span>
  const lower = result.toLowerCase()
  if (lower === 'win') return <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">Win</span>
  if (lower === 'loss') return <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-800">Loss</span>
  return <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">Draw</span>
}

function MmrDelta({ delta }) {
  if (delta == null) return <span className="text-gray-400">—</span>
  if (delta > 0) return <span className="text-green-600 font-medium">+{delta}</span>
  if (delta < 0) return <span className="text-red-600 font-medium">{delta}</span>
  return <span className="text-gray-500">0</span>
}

function InkIcons({ colors }) {
  return (
    <SharedInkIcons
      colors={colors}
      size="w-5 h-5"
      emptyFallback={<span className="text-gray-400">—</span>}
    />
  )
}

function ImportGamelogButton({ game }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState(null) // null | 'loading' | 'done' | 'error'

  if (!game.gamelog_id) return null

  async function handleImport() {
    setStatus('loading')
    try {
      const buf = await fetchGamelogBuffer(game.gamelog_id)
      const text = await decompressGzip(buf)
      const logs = JSON.parse(text)
      const id = game.gamelog_id
      const storedMyName = localStorage.getItem('lorcana_my_name') ?? ''
      const storedDeckNames = JSON.parse(localStorage.getItem(DECK_NAMES_KEY) ?? '{}')
      const deckName = game.your_deck_id ? (storedDeckNames[game.your_deck_id] ?? null) : null
      const parsed = parseGamelog(id, logs, {
        yourResult: game.result,
        yourPlayerNum: game.your_player,
        opponentName: game.opp_display_name,
        yourDisplayName: game.your_display_name || storedMyName || undefined,
        yourColors: game.your_deck_colors,
        oppColors: game.opp_deck_colors,
        wentFirst: game.went_first,
        endReason: game.end_reason,
        yourDecklist: game.your_decklist,
        startedAt: game.started_at,
        mmr_delta: game.mmr_delta,
        mmr_before: game.mmr_before,
        mmr_after: game.mmr_after,
        duration_seconds: game.duration_seconds,
        match_id: game.match_id,
        match_format: game.match_format,
        match_game_number: game.match_game_number,
        deckName,
        deck_id: game.your_deck_id ?? null,
        queue_name: game.queue_name,
        replay_url: game.replay_id ?? game.replay_url,
      })
      await saveGamelog(id, parsed, logs)
      setStatus('done')
      navigate('/analytics')
    } catch {
      setStatus('error')
      setTimeout(() => setStatus(null), 3000)
    }
  }

  return (
    <button
      onClick={handleImport}
      disabled={status === 'loading'}
      className="text-xs text-gray-400 hover:text-gray-900 transition-colors disabled:opacity-40 whitespace-nowrap"
      title="Import gamelog into Analytics"
    >
      {status === 'loading' ? 'Importing…' : status === 'error' ? 'Failed' : '↗ Gamelog'}
    </button>
  )
}

function MatchSeriesBadge({ wins, losses }) {
  const matchWon = wins > losses
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${matchWon ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
        {matchWon ? 'Win' : 'Loss'}
      </span>
      <span className="text-xs text-gray-400">{wins}–{losses}</span>
    </div>
  )
}

function GameRow({ game, selected, onToggle, indent = false, gameLabel = null, deckName = null }) {
  const isSealed = game.queue_id?.toLowerCase().includes('sealed') || game.queue_name?.toLowerCase().includes('sealed')
  const id = game.game_id
  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${selected ? 'bg-blue-50 hover:bg-blue-50' : ''} ${indent ? 'opacity-90' : ''}`}
      onClick={() => onToggle(id)}
    >
      <td className={`py-3 pr-1 ${indent ? 'pl-7' : 'pl-3'}`} onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(id)}
          className="rounded border-gray-300 text-gray-900 focus:ring-gray-400 cursor-pointer"
        />
      </td>
      <td className="py-3 px-3 text-sm text-gray-600 whitespace-nowrap">
        {indent ? (
          <span className="text-xs text-gray-400">{formatDate(game.started_at)}</span>
        ) : formatDate(game.started_at)}
      </td>
      <td className="py-3 px-3 text-sm text-gray-700 hidden sm:table-cell max-w-[120px] truncate">
        {gameLabel ? <span className="text-xs text-gray-500 font-medium">{gameLabel}</span> : (game.queue_name ?? '—')}
      </td>
      <td className="py-3 px-3">
        <ResultBadge result={game.result} />
      </td>
      <td className="py-3 px-3 hidden sm:table-cell">
        {isSealed ? <span className="text-gray-400 text-sm">Sealed</span> : (
          <div className="flex flex-col gap-0.5">
            <InkIcons colors={game.your_deck_colors} />
            {deckName && <span className="text-[11px] text-gray-400 leading-tight max-w-[120px] truncate">{deckName}</span>}
          </div>
        )}
      </td>
      <td className="py-3 px-3 hidden sm:table-cell">
        {!isSealed && game.opp_deck_colors ? <InkIcons colors={game.opp_deck_colors} /> : <span className="text-gray-400">—</span>}
      </td>
      <td className="py-3 px-3 text-sm text-gray-700 font-medium">
        {indent ? <span className="text-gray-400">—</span> : (game.opp_display_name ?? '—')}
      </td>
      <td className="py-3 px-3 text-sm text-gray-700 whitespace-nowrap">
        {game.your_lore ?? '?'} – {game.opp_lore ?? '?'}
      </td>
      <td className="py-3 px-3 text-sm hidden sm:table-cell text-center">
        {indent ? <span className="text-gray-400">—</span> : <MmrDelta delta={game.mmr_delta} />}
      </td>
      <td className="py-3 px-3 hidden sm:table-cell" onClick={e => e.stopPropagation()}>
        <ImportGamelogButton game={game} />
      </td>
    </tr>
  )
}

function MatchGroup({ games, selected, onToggle, onToggleMatch, deckName = null }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...games].sort((a, b) => (a.match_game_number ?? 0) - (b.match_game_number ?? 0))
  const wins = sorted.filter(g => g.result === 'win').length
  const losses = sorted.filter(g => g.result === 'loss').length
  const isSealed = games[0]?.queue_id?.toLowerCase().includes('sealed')
  const queueName = games[0]?.queue_name ?? 'BO3'
  // MMR delta comes from the decisive game (the one with a non-zero delta, or the last game)
  const mmrGame = sorted.find(g => g.mmr_delta != null && g.mmr_delta !== 0) ?? sorted[sorted.length - 1]
  const matchMmr = mmrGame?.mmr_delta ?? null
  const gameIds = sorted.map(g => g.game_id)
  const allSel = gameIds.every(id => selected.has(id))
  const someSel = gameIds.some(id => selected.has(id)) && !allSel

  return (
    <>
      <tr
        className="border-b border-gray-200 bg-gray-50/70 hover:bg-gray-100 transition-colors cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="py-3 pl-3 pr-1" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={allSel}
            ref={el => { if (el) el.indeterminate = someSel }}
            onChange={() => onToggleMatch(gameIds)}
            className="rounded border-gray-300 text-gray-900 focus:ring-gray-400 cursor-pointer"
          />
        </td>
        <td className="py-3 px-3 text-sm text-gray-600 whitespace-nowrap">
          {formatDate(sorted[0]?.started_at)}
        </td>
        <td className="py-3 px-3 text-sm text-gray-700 hidden sm:table-cell max-w-[120px] truncate">
          <span className="flex items-center gap-1.5">
            <span className="truncate">{queueName}</span>
            <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </td>
        <td className="py-3 px-3">
          <MatchSeriesBadge wins={wins} losses={losses} />
        </td>
        <td className="py-3 px-3 hidden sm:table-cell">
          {isSealed ? <span className="text-gray-400 text-sm">Sealed</span> : (
            <div className="flex flex-col gap-0.5">
              <InkIcons colors={games[0]?.your_deck_colors} />
              {deckName && <span className="text-[11px] text-gray-400 leading-tight max-w-[120px] truncate">{deckName}</span>}
            </div>
          )}
        </td>
        <td className="py-3 px-3 hidden sm:table-cell">
          {!isSealed && games[0]?.opp_deck_colors ? <InkIcons colors={games[0]?.opp_deck_colors} /> : <span className="text-gray-400">—</span>}
        </td>
        <td className="py-3 px-3 text-sm text-gray-700 font-medium">
          {games[0]?.opp_display_name ?? '—'}
        </td>
        <td className="py-3 px-3 text-sm text-gray-500 whitespace-nowrap font-medium">
          {wins}–{losses}
        </td>
        <td className="py-3 px-3 text-sm hidden sm:table-cell text-center">
          <MmrDelta delta={matchMmr} />
        </td>
        <td className="py-3 px-3 hidden sm:table-cell" />
      </tr>
      {expanded && sorted.map((game, i) => (
        <GameRow
          key={game.game_id}
          game={game}
          selected={selected.has(game.game_id)}
          onToggle={onToggle}
          indent
          gameLabel={`Game ${game.match_game_number ?? i + 1}`}
          deckName={deckName}
        />
      ))}
    </>
  )
}

function FilterRow({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-24 flex-shrink-0">{label}</span>
      {children}
    </div>
  )
}

export function MatchHistoryPage() {
  const navigate = useNavigate()
  const hasToken = Boolean(getToken())
  const [activeToken, setActiveTokenState] = useState(() => {
    const tokens = getTokens()
    if (!tokens.length) return null
    const activeId = getActiveTokenId()
    return tokens.find(t => t.id === activeId) ?? tokens[0]
  })
  const activeTokenLabel = activeToken?.username || activeToken?.label || null
  const [games, setGames] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkOp, setBulkOp] = useState(null) // null | { done, total, errors, label }
  const [filterQueue, setFilterQueue] = useState(null)
  const [filterMyColors, setFilterMyColors] = useState(null)
  const [filterOppColors, setFilterOppColors] = useState(null)
  const [filterDeck, setFilterDeck] = useState(null)
  const [filterDatePreset, setFilterDatePreset] = useState(null) // 'today' | '7d' | '30d' | 'month' | 'custom'
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [deckNames, setDeckNames] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DECK_NAMES_KEY) ?? '{}') } catch { return {} }
  })
  const [deckDetailMap, setDeckDetailMap] = useState(() => {
    const cached = JSON.parse(localStorage.getItem(DECK_DETAILS_KEY) ?? '{}')
    return Object.fromEntries(Object.entries(cached).map(([id, deck]) => [id, { status: 'loaded', deck }]))
  })
  const [expandedDeckKey, setExpandedDeckKey] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(null)
  const fetchedDeckIds = useRef(new Set())
  const { cards } = useCards()
  const cardIdToName = useMemo(() => {
    // When LorcanaJSON has multiple entries with the same setCode-number (e.g. promo reprints),
    // prefer non-promo cards, then Core > Infinity > other format cards, then higher set number on ties.
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

  async function load({ cursor = null, append = false } = {}) {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await fetchMatchHistory({ cursor: cursor ?? undefined, limit: 500 })
      const incoming = data.games ?? []
      setGames(prev => append ? [...prev, ...incoming] : incoming)
      setNextCursor(data.next_cursor ?? null)
      // Auto-capture your_user_id on the active token so games can be attributed by player
      if (!append && incoming.length > 0 && incoming[0].your_user_id) {
        const tokens = getTokens()
        const activeId = getActiveTokenId()
        const active = tokens.find(t => t.id === activeId) ?? tokens[0]
        if (active) {
          setTokenUserId(active.id, incoming[0].your_user_id)
          setActiveTokenState(prev => prev ? { ...prev, userId: incoming[0].your_user_id } : prev)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  async function syncDeckNamesFromApi() {
    try {
      const data = await fetchDecks()
      const decks = data.decks ?? []
      if (!decks.length) return
      setDeckNames(prev => {
        const merged = { ...prev }
        let changed = false
        for (const deck of decks) {
          if (deck.id && deck.name && merged[deck.id] !== deck.name) {
            merged[deck.id] = deck.name
            changed = true
          }
        }
        if (changed) localStorage.setItem(DECK_NAMES_KEY, JSON.stringify(merged))
        return changed ? merged : prev
      })
    } catch {
      // silently ignore — deck names just won't be auto-filled
    }
  }

  // Initial data load on mount. load() sets a loading flag synchronously, which
  // is the intended behavior for a first fetch.
  useEffect(() => {
    if (!hasToken) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    load()
    syncDeckNamesFromApi()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getDeckKey = useCallback((g) => g.your_deck_id ?? deckFingerprint(g.your_decklist), [])

  const deckStats = useMemo(() => {
    const byDeck = {}
    for (const g of games) {
      const isSealed = g.queue_id?.toLowerCase().includes('sealed') || g.queue_name?.toLowerCase().includes('sealed')
      if (isSealed) continue
      const key = getDeckKey(g)
      if (!key) continue
      if (!byDeck[key]) byDeck[key] = {
        key,
        deckId: g.your_deck_id ?? null,
        colors: g.your_deck_colors,
        wins: 0, losses: 0, loreTotal: 0, loreGames: 0,
        latestDecklist: g.your_decklist ?? null, // games sorted newest-first
      }
      if (g.result === 'win') byDeck[key].wins++
      else if (g.result === 'loss') byDeck[key].losses++
      if (g.your_lore != null) { byDeck[key].loreTotal += g.your_lore; byDeck[key].loreGames++ }
    }
    return Object.values(byDeck).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))
  }, [games, getDeckKey])

  // Background-fetch deck details for all constructed decks with a real deckId
  useEffect(() => {
    const deletedIds = getDeletedDeckIds()
    for (const { deckId } of deckStats) {
      if (!deckId || fetchedDeckIds.current.has(deckId)) continue
      if (deletedIds.has(deckId)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- background sync of fetch status
        setDeckDetailMap(prev => ({ ...prev, [deckId]: { status: 'deleted', deck: null } }))
        continue
      }
      fetchedDeckIds.current.add(deckId)
      setDeckDetailMap(prev => ({ ...prev, [deckId]: { status: 'loading', deck: null } }))
      fetchDeck(deckId)
        .then(data => {
          setDeckDetailMap(prev => ({ ...prev, [deckId]: { status: 'loaded', deck: data.deck } }))
          if (data.deck) {
            const cached = JSON.parse(localStorage.getItem(DECK_DETAILS_KEY) ?? '{}')
            cached[deckId] = data.deck
            localStorage.setItem(DECK_DETAILS_KEY, JSON.stringify(cached))
          }
        })
        .catch(err => {
          if (err?.status === 404) {
            markDeckDeleted(deckId)
            setDeckDetailMap(prev => ({ ...prev, [deckId]: { status: 'deleted', deck: null } }))
          } else {
            setDeckDetailMap(prev => ({ ...prev, [deckId]: { status: 'error', deck: null } }))
          }
        })
    }
  }, [deckStats])

  async function handleLoadInsights(deckStat) {
    setInsightsLoading(deckStat.key)
    try {
      let entries = []
      const detail = deckStat.deckId ? deckDetailMap[deckStat.deckId] : null
      if (detail?.deck?.cardIds) {
        const counts = {}
        for (const id of detail.deck.cardIds) counts[id] = (counts[id] ?? 0) + 1
        entries = Object.entries(counts).map(([cardId, count]) => ({ cardId, count }))
      } else if (deckStat.latestDecklist?.length) {
        entries = deckStat.latestDecklist
      }
      if (!entries.length) return
      const lines = entries.map(({ cardId, count }) => `${count} ${cardIdToName[cardId] ?? cardId}`)
      localStorage.setItem('drawOdds.deckText', lines.join('\n'))
      navigate('/deck-insights')
    } finally {
      setInsightsLoading(null)
    }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectMatch(gameIds) {
    const allSel = gameIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSel) gameIds.forEach(id => next.delete(id))
      else gameIds.forEach(id => next.add(id))
      return next
    })
  }

  function toggleSelectAll() {
    if (filteredGames.every(g => selected.has(g.game_id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredGames.map(g => g.game_id)))
    }
  }

  async function handleBulkImportGamelogs() {
    const toImport = games.filter(g => selected.has(g.game_id) && g.gamelog_id)
    if (!toImport.length) return
    const storedMyName = localStorage.getItem('lorcana_my_name') ?? ''
    setBulkOp({ done: 0, total: toImport.length, errors: 0, label: 'Importing gamelogs' })

    let done = 0, errors = 0
    for (const game of toImport) {
      try {
        // Fetch via proxy with retry on 429 (rate limit = 30 req/60s on duels.ink endpoint)
        let buf = null
        for (let attempt = 0; attempt <= 3; attempt++) {
          try {
            buf = await fetchGamelogBuffer(game.gamelog_id)
            break
          } catch (err) {
            if (err.message?.includes('429') && attempt < 3) {
              await new Promise(r => {
                let remaining = 65
                setBulkOp(prev => ({ ...prev, label: `Rate limited — waiting ${remaining}s…` }))
                const interval = setInterval(() => {
                  remaining--
                  if (remaining <= 0) {
                    clearInterval(interval)
                    r()
                  } else {
                    setBulkOp(prev => ({ ...prev, label: `Rate limited — waiting ${remaining}s…` }))
                  }
                }, 1000)
              })
              setBulkOp(prev => ({ ...prev, label: 'Importing gamelogs' }))
            } else {
              throw err
            }
          }
        }
        const text = await decompressGzip(buf)
        const logs = JSON.parse(text)
        const deckName = game.your_deck_id ? (deckNames[game.your_deck_id] ?? null) : null
        const parsed = parseGamelog(game.gamelog_id, logs, {
          yourResult: game.result,
          yourPlayerNum: game.your_player,
          opponentName: game.opp_display_name,
          yourDisplayName: game.your_display_name || storedMyName || undefined,
          yourColors: game.your_deck_colors,
          oppColors: game.opp_deck_colors,
          wentFirst: game.went_first,
          endReason: game.end_reason,
          yourDecklist: game.your_decklist,
          startedAt: game.started_at,
          mmr_delta: game.mmr_delta,
          mmr_before: game.mmr_before,
          mmr_after: game.mmr_after,
          duration_seconds: game.duration_seconds,
          match_id: game.match_id,
          match_format: game.match_format,
          match_game_number: game.match_game_number,
          deckName,
          deck_id: game.your_deck_id ?? null,
          queue_name: game.queue_name,
          userId: game.your_user_id ?? null,
          replay_url: game.replay_id ?? game.replay_url,
        })
        await saveGamelog(game.gamelog_id, parsed, logs)
        done++
      } catch {
        errors++
      }
      setBulkOp({ done, total: toImport.length, errors, label: 'Importing gamelogs' })
    }
    setSelected(new Set())
    if (errors === 0) {
      navigate('/analytics')
    } else {
      setTimeout(() => setBulkOp(null), 4000)
    }
  }

  // Cascading filters — each layer narrows options for the next

  const dateFilterBounds = (() => {
    const now = new Date()
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
    if (filterDatePreset === 'today') return { from: startOfDay(now), to: null }
    if (filterDatePreset === '7d') return { from: new Date(now - 7 * 864e5), to: null }
    if (filterDatePreset === '30d') return { from: new Date(now - 30 * 864e5), to: null }
    if (filterDatePreset === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null }
    if (filterDatePreset === 'custom') {
      return {
        from: filterDateFrom ? new Date(filterDateFrom + 'T00:00:00') : null,
        to: filterDateTo ? new Date(filterDateTo + 'T23:59:59') : null,
      }
    }
    return null
  })()

  const afterDate = games.filter(g => {
    if (!dateFilterBounds || !g.started_at) return true
    const t = new Date(g.started_at)
    if (dateFilterBounds.from && t < dateFilterBounds.from) return false
    if (dateFilterBounds.to && t > dateFilterBounds.to) return false
    return true
  })

  const queues = [...new Set(afterDate.map(g => g.queue_name).filter(Boolean))].sort()
  const afterQueue = afterDate.filter(g => !filterQueue || g.queue_name === filterQueue)

  const colorCount = (colors) => colors ? colors.split('/').filter(Boolean).length : 0
  const myColorOptions = [...new Set(afterQueue.map(g => g.your_deck_colors).filter(c => c && colorCount(c) <= 2))].sort()
  const afterMyColors = afterQueue.filter(g => !filterMyColors || g.your_deck_colors === filterMyColors)

  const oppColorOptions = [...new Set(afterMyColors.map(g => g.opp_deck_colors).filter(c => c && colorCount(c) <= 2))].sort()
  const afterOppColors = afterMyColors.filter(g => !filterOppColors || g.opp_deck_colors === filterOppColors)

  const { seenDeckKeys } = useMemo(() => {
    const options = []
    const keys = new Set()
    for (const g of afterOppColors) {
      const key = getDeckKey(g)
      if (key && !keys.has(key) && colorCount(g.your_deck_colors) <= 2) {
        keys.add(key)
        options.push({ fp: key, colors: g.your_deck_colors })
      }
    }
    return { deckOptions: options, seenDeckKeys: keys }
  }, [afterOppColors, getDeckKey])

  const filteredGames = afterOppColors.filter(g => !filterDeck || getDeckKey(g) === filterDeck)

  // Auto-clear downstream filters that are no longer valid
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (filterQueue && !queues.includes(filterQueue)) setFilterQueue(null) }, [queues, filterQueue])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (filterMyColors && !myColorOptions.includes(filterMyColors)) setFilterMyColors(null) }, [myColorOptions, filterMyColors])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (filterOppColors && !oppColorOptions.includes(filterOppColors)) setFilterOppColors(null) }, [oppColorOptions, filterOppColors])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (filterDeck && !seenDeckKeys.has(filterDeck)) setFilterDeck(null) }, [filterDeck, seenDeckKeys])

  // Group BO3 games by match_id for display; BO1 games stay as individual rows
  const displayItems = (() => {
    const items = []
    const matchGroups = {}
    for (const g of filteredGames) {
      if (g.match_id) {
        if (!matchGroups[g.match_id]) {
          matchGroups[g.match_id] = { type: 'match', match_id: g.match_id, games: [] }
          items.push(matchGroups[g.match_id])
        }
        matchGroups[g.match_id].games.push(g)
      } else {
        items.push({ type: 'game', game: g })
      }
    }
    return items
  })()

  const selectedGames = filteredGames.filter(g => selected.has(g.game_id))
  const hasGamelogs = selectedGames.some(g => g.gamelog_id)
  const allSelected = filteredGames.length > 0 && filteredGames.every(g => selected.has(g.game_id))
  const someSelected = selectedGames.length > 0 && !allSelected

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">Match History</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-gray-500">Imported from duels.ink</p>
          {activeTokenLabel && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-500">
                Viewing as{' '}
                <Link to="/settings" className="font-medium text-gray-700 hover:text-gray-900 transition-colors">
                  {activeTokenLabel}
                </Link>
              </span>
            </>
          )}
        </div>
      </div>

      {!hasToken && (
        <div className="border border-gray-200 rounded-lg p-6 text-sm text-gray-600">
          Add your duels.ink API token in{' '}
          <Link to="/settings" className="underline hover:text-gray-900 transition-colors">
            Settings
          </Link>{' '}
          to import match history.
        </div>
      )}

      {hasToken && loading && (
        <p className="text-sm text-gray-500">Loading match history…</p>
      )}

      {hasToken && error && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {hasToken && !loading && !error && games.length === 0 && (
        <p className="text-sm text-gray-500">No games found.</p>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && !bulkOp && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2.5 bg-gray-900 text-white rounded-lg text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-gray-400">·</span>
          <div className="flex items-center gap-2 ml-auto">
            {hasGamelogs && (
              <button
                onClick={handleBulkImportGamelogs}
                className="px-3 py-1 bg-white text-gray-900 rounded text-xs font-semibold hover:bg-gray-100 transition-colors"
              >
                Import Gamelogs ({selectedGames.filter(g => g.gamelog_id).length})
              </button>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1 text-gray-300 hover:text-white text-xs transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Bulk progress */}
      {bulkOp && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2.5 bg-gray-900 text-white rounded-lg text-sm">
          <span className="font-medium">{bulkOp.label}…</span>
          <span className="text-gray-300">{bulkOp.done}/{bulkOp.total}</span>
          {bulkOp.errors > 0 && <span className="text-red-400">{bulkOp.errors} failed</span>}
          <div className="ml-auto h-1.5 w-32 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{ width: `${(bulkOp.done / bulkOp.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Filters */}
      {games.length > 0 && (
        <div className="mb-4 flex flex-col gap-2.5">
          <FilterRow label="Date">
            {[
              { key: 'today', label: 'Today' },
              { key: '7d', label: 'Last 7 days' },
              { key: '30d', label: 'Last 30 days' },
              { key: 'month', label: 'This month' },
              { key: 'custom', label: 'Custom' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterDatePreset(prev => prev === key ? null : key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterDatePreset === key ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
              >
                {label}
              </button>
            ))}
            {filterDatePreset === 'custom' && (
              <>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </>
            )}
          </FilterRow>
          {queues.length > 1 && (
            <FilterRow label="Queue">
              {queues.map(q => (
                <button
                  key={q}
                  onClick={() => setFilterQueue(prev => prev === q ? null : q)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterQueue === q ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
                >
                  {q}
                </button>
              ))}
            </FilterRow>
          )}
          {myColorOptions.length > 1 && (
            <FilterRow label="My Colors">
              {myColorOptions.map(colors => (
                <button
                  key={colors}
                  onClick={() => setFilterMyColors(prev => prev === colors ? null : colors)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full border transition-colors ${filterMyColors === colors ? 'bg-gray-900 border-gray-900' : 'border-gray-300 hover:border-gray-500'}`}
                  title={colors}
                >
                  <InkIcons colors={colors} />
                </button>
              ))}
            </FilterRow>
          )}
          {oppColorOptions.length > 1 && (
            <FilterRow label="Opp Colors">
              {oppColorOptions.map(colors => (
                <button
                  key={colors}
                  onClick={() => setFilterOppColors(prev => prev === colors ? null : colors)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full border transition-colors ${filterOppColors === colors ? 'bg-gray-900 border-gray-900' : 'border-gray-300 hover:border-gray-500'}`}
                  title={colors}
                >
                  <InkIcons colors={colors} />
                </button>
              ))}
            </FilterRow>
          )}
          {(filterQueue || filterMyColors || filterOppColors || filterDeck || filterDatePreset) && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setFilterQueue(null); setFilterMyColors(null); setFilterOppColors(null); setFilterDeck(null); setFilterDatePreset(null); setFilterDateFrom(''); setFilterDateTo('') }}
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
              >
                Clear filters
              </button>
              <span className="text-xs text-gray-400">· {filteredGames.length}/{games.length} shown</span>
            </div>
          )}
        </div>
      )}

      {deckStats.length > 1 && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">By Deck</div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {deckStats.map((stat) => {
              const { key, deckId, colors, wins, losses, loreTotal, loreGames, latestDecklist } = stat
              const total = wins + losses
              const wr = total > 0 ? wins / total : null
              const name = deckNames[key] ?? null
              const avgLore = loreGames > 0 ? (loreTotal / loreGames).toFixed(1) : null
              const detail = deckId ? deckDetailMap[deckId] : null
              const modified = detail?.status === 'loaded' && isDeckModified(latestDecklist, detail.deck?.cardIds)
              const isSelected = filterDeck === key
              const isExpanded = expandedDeckKey === key
              return (
                <div
                  key={key}
                  onClick={() => setFilterDeck(prev => prev === key ? null : key)}
                  className={`flex-shrink-0 text-left border rounded-lg px-3 py-2.5 cursor-pointer transition-colors min-w-[140px] ${isSelected ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-200 hover:border-gray-400 bg-white'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <InkIcons colors={colors} />
                    {modified && <span className="ml-auto text-[10px] text-amber-500 font-medium flex-shrink-0">updated</span>}
                  </div>
                  {name && <div className={`text-[11px] font-medium truncate max-w-[130px] mb-1 ${isSelected ? 'text-gray-300' : 'text-gray-600'}`}>{name}</div>}
                  <div className={`text-sm font-bold ${isSelected ? 'text-white' : wr != null && wr >= 0.5 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {wins}–{losses}
                    {wr != null && <span className="ml-1.5 text-xs font-normal text-gray-400">{Math.round(wr * 100)}%</span>}
                  </div>
                  {avgLore && <div className="text-[11px] text-gray-400">{avgLore} avg lore</div>}
                  {(deckId || latestDecklist?.length > 0) && (
                    <div
                      className={`flex gap-1.5 mt-2 pt-2 border-t ${isSelected ? 'border-gray-700' : 'border-gray-100'}`}
                      onClick={e => e.stopPropagation()}
                    >
                      {deckId && (
                        <button
                          onClick={() => setExpandedDeckKey(prev => prev === key ? null : key)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${isExpanded ? (isSelected ? 'bg-gray-600 border-gray-500 text-white' : 'bg-gray-100 border-gray-300 text-gray-700') : (isSelected ? 'border-gray-600 text-gray-300 hover:border-gray-400' : 'border-gray-200 text-gray-500 hover:border-gray-400')}`}
                        >
                          Cards
                        </button>
                      )}
                      <button
                        onClick={() => handleLoadInsights(stat)}
                        disabled={insightsLoading === key}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-40 ${isSelected ? 'border-gray-600 text-gray-300 hover:border-gray-400' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
                      >
                        {insightsLoading === key ? '…' : '→ Insights'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {expandedDeckKey && (() => {
            const stat = deckStats.find(d => d.key === expandedDeckKey)
            if (!stat?.deckId) return null
            const detail = deckDetailMap[stat.deckId]
            const name = deckNames[expandedDeckKey]
            const modified = detail?.status === 'loaded' && isDeckModified(stat.latestDecklist, detail.deck?.cardIds)
            // Flat card ID array from game-time decklist for comparison display
            const gameCardIds = stat.latestDecklist?.flatMap(({ cardId, count }) => Array(count ?? 1).fill(cardId)) ?? []
            return (
              <div className="mt-3 border border-gray-200 rounded-lg bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{name ?? 'Deck'}</span>
                    <InkIcons colors={stat.colors} />
                    {detail?.deck?.legalFormats?.map(f => (
                      <span key={f} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{f.replace('Constructed', '')}</span>
                    ))}
                    {modified && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded border border-amber-200">updated since last game</span>
                    )}
                  </div>
                  <button onClick={() => setExpandedDeckKey(null)} className="text-xs text-gray-400 hover:text-gray-700 ml-4 flex-shrink-0">✕</button>
                </div>
                <div className="p-4">
                  {detail?.status === 'loading' && <div className="text-sm text-gray-400">Loading deck…</div>}
                  {detail?.status === 'error' && <div className="text-sm text-red-400">Failed to load deck list</div>}
                  {modified && gameCardIds.length > 0 && (
                    <div className="mb-4">
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Used in games</div>
                      <DeckCardList cardIds={gameCardIds} cardIdToName={cardIdToName} />
                    </div>
                  )}
                  {detail?.deck?.cardIds && (
                    <div>
                      {modified && <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Current deck</div>}
                      <DeckCardList cardIds={detail.deck.cardIds} cardIdToName={cardIdToName} />
                    </div>
                  )}
                  <button
                    onClick={() => handleLoadInsights(stat)}
                    disabled={insightsLoading === stat.key}
                    className="mt-4 text-xs px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-40"
                  >
                    {insightsLoading === stat.key ? 'Loading…' : '→ Load into Deck Insights'}
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {games.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pl-3 pr-1">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-400 cursor-pointer"
                  />
                </th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Queue</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Your Colors</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Opp Colors</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Opponent</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell text-center">MMR Δ</th>
                <th className="py-2 px-3 hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {displayItems.map((item, i) =>
                item.type === 'match' ? (
                  <MatchGroup
                    key={item.match_id}
                    games={item.games}
                    selected={selected}
                    onToggle={toggleSelect}
                    onToggleMatch={toggleSelectMatch}
                    deckName={deckNames[getDeckKey(item.games[0])] ?? null}
                  />
                ) : (
                  <GameRow
                    key={item.game.game_id ?? i}
                    game={item.game}
                    selected={selected.has(item.game.game_id)}
                    onToggle={toggleSelect}
                    deckName={deckNames[getDeckKey(item.game)] ?? null}
                  />
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => load({ cursor: nextCursor, append: true })}
            disabled={loadingMore}
            className="border border-gray-900 text-sm font-medium px-4 py-2 hover:bg-gray-900 hover:text-white transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

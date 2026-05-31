import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getToken, fetchMatchHistory, fetchGamelogBuffer } from '../lib/duelsApi'
import { saveGamelog } from '../lib/gamelogHistory'
import { decompressGzip, parseGamelog } from '../lib/parseGamelog'
import { createGameExportZip } from '../lib/gameExport'

const DECK_NAMES_KEY = 'lorcana_deck_names'

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

function formatDuration(seconds) {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
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
  if (!colors) return <span className="text-gray-400">—</span>
  const names = colors.split('/').map(c => c.trim().toLowerCase()).filter(Boolean)
  return (
    <span className="flex items-center gap-1">
      {names.map(name => (
        <img key={name} src={`/ink/${name}.png`} alt={name} title={name} className="w-5 h-5" />
      ))}
    </span>
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
      })
      await saveGamelog(id, parsed, logs)
      setStatus('done')
      navigate('/gamelog-analyzer')
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
      title="Import gamelog into Gamelog Analyzer"
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

function GameRow({ game, selected, onToggle, indent = false, gameLabel = null }) {
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
        {isSealed ? <span className="text-gray-400 text-sm">Sealed</span> : <InkIcons colors={game.your_deck_colors} />}
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

function MatchGroup({ games, selected, onToggle, onToggleMatch }) {
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
          {isSealed ? <span className="text-gray-400 text-sm">Sealed</span> : <InkIcons colors={games[0]?.your_deck_colors} />}
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

function DeckFilterPills({ deckOptions, deckNames, filterDeck, onSelect, onRename }) {
  const [editingFp, setEditingFp] = useState(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef(null)

  function startEdit(fp, currentName) {
    setEditingFp(fp)
    setEditValue(currentName)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commitEdit() {
    if (editingFp) onRename(editingFp, editValue)
    setEditingFp(null)
  }

  return (
    <FilterRow label="My Deck">
      {deckOptions.map(({ fp, colors }, i) => {
        const name = deckNames[fp] || null
        const isActive = filterDeck === fp
        const label = name ?? (deckOptions.length > 1 ? `Deck ${i + 1}` : 'My Deck')
        return (
          <div key={fp} className="flex items-center gap-0.5">
            <button
              onClick={() => onSelect(fp)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors text-xs ${isActive ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
            >
              <InkIcons colors={colors} />
              <span>{label}</span>
            </button>
            {editingFp === fp ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingFp(null) }}
                className="ml-1 text-xs border border-gray-300 rounded px-1.5 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-gray-400"
                placeholder="Deck name…"
              />
            ) : (
              <button
                onClick={() => startEdit(fp, deckNames[fp] ?? '')}
                className="ml-0.5 text-gray-300 hover:text-gray-600 transition-colors text-xs"
                title="Rename deck"
              >✎</button>
            )}
          </div>
        )
      })}
    </FilterRow>
  )
}

export function MatchHistoryPage() {
  const navigate = useNavigate()
  const hasToken = Boolean(getToken())
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

  async function load({ cursor = null, append = false } = {}) {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await fetchMatchHistory({ cursor: cursor ?? undefined, limit: 100 })
      const incoming = data.games ?? []
      setGames(prev => append ? [...prev, ...incoming] : incoming)
      setNextCursor(data.next_cursor ?? null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (hasToken) load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        const buf = await fetchGamelogBuffer(game.gamelog_id)
        const text = await decompressGzip(buf)
        const logs = JSON.parse(text)
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
      navigate('/gamelog-analyzer')
    } else {
      setTimeout(() => setBulkOp(null), 4000)
    }
  }

  function saveDeckName(fp, name) {
    const updated = { ...deckNames, [fp]: name.trim() }
    setDeckNames(updated)
    localStorage.setItem(DECK_NAMES_KEY, JSON.stringify(updated))
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

  const getDeckKey = (g) => g.your_deck_id ?? deckFingerprint(g.your_decklist)

  const deckOptions = []
  const seenDeckKeys = new Set()
  for (const g of afterOppColors) {
    const key = getDeckKey(g)
    if (key && !seenDeckKeys.has(key) && colorCount(g.your_deck_colors) <= 2) {
      seenDeckKeys.add(key)
      deckOptions.push({ fp: key, colors: g.your_deck_colors })
    }
  }

  const filteredGames = afterOppColors.filter(g => !filterDeck || getDeckKey(g) === filterDeck)

  // Auto-clear downstream filters that are no longer valid
  useEffect(() => { if (filterQueue && !queues.includes(filterQueue)) setFilterQueue(null) }, [queues, filterQueue])
  useEffect(() => { if (filterMyColors && !myColorOptions.includes(filterMyColors)) setFilterMyColors(null) }, [myColorOptions, filterMyColors])
  useEffect(() => { if (filterOppColors && !oppColorOptions.includes(filterOppColors)) setFilterOppColors(null) }, [oppColorOptions, filterOppColors])
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
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">Match History</h1>
        <p className="text-sm text-gray-500">Imported from duels.ink</p>
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
          {deckOptions.length > 0 && (
            <DeckFilterPills
              deckOptions={deckOptions}
              deckNames={deckNames}
              filterDeck={filterDeck}
              onSelect={fp => setFilterDeck(prev => prev === fp ? null : fp)}
              onRename={saveDeckName}
            />
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
                  />
                ) : (
                  <GameRow
                    key={item.game.game_id ?? i}
                    game={item.game}
                    selected={selected.has(item.game.game_id)}
                    onToggle={toggleSelect}
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

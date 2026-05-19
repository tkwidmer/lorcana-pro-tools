import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getToken, fetchMatchHistory, fetchReplayBuffer, fetchGamelogBuffer } from '../lib/duelsApi'
import { saveGamelog } from '../lib/gamelogHistory'

const DECK_NAMES_KEY = 'lorcana_deck_names'

function deckFingerprint(decklist) {
  if (!decklist) return null
  const cards = Array.isArray(decklist) ? decklist : Object.values(decklist)
  const key = cards.map(c => (typeof c === 'string' ? c : (c?.name ?? c?.id ?? ''))).filter(Boolean).sort().join('|')
  if (!key) return null
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0
  }
  return String(Math.abs(h))
}

// --- Inline helpers for gamelog import ---

async function decompressGzip(arrayBuffer) {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(arrayBuffer)
  writer.close()
  const chunks = []
  const reader = ds.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return new TextDecoder().decode(out)
}


function parseColors(str) {
  if (!str) return []
  return str.split('/').map(c => c.trim().toLowerCase()).filter(Boolean)
}

function parseGamelog(id, logs, meta = {}) {
  const players = {
    1: { initialHand: [], mulliganSent: [], mulliganKept: [], mulliganDrawn: [], cards: {} },
    2: { initialHand: [], mulliganSent: [], mulliganKept: [], mulliganDrawn: [], cards: {} },
  }
  let p1Name = 'Player 1', p2Name = 'Player 2'
  let winner = null, turnCount = 0
  let victoryReason = null, concededBy = null
  let wentFirstFromLog = null
  const loreByPlayer = { 1: 0, 2: 0 }
  const loreEvents = []
  const challenges = []

  const ensureCard = (p, name, cardId) => {
    const pData = players[p]
    if (!pData.cards[name]) {
      pData.cards[name] = {
        name, id: cardId,
        drawn: 0, played: 0, inked: 0, discarded: 0, destroyed: 0,
        loreGained: 0, shiftPlays: 0,
        effectDraws: 0, oppForcedDiscards: 0, extraInks: 0, effectRemovals: 0, exerts: 0, cardsRecovered: 0,
      }
    }
    return pData.cards[name]
  }

  for (const entry of logs) {
    const p = entry.player === 1 || entry.player === '1' ? 1 : entry.player === 2 || entry.player === '2' ? 2 : null
    const type = entry.type
    const d = entry.data ?? {}
    if ((entry.turnNumber ?? 0) > turnCount) turnCount = entry.turnNumber ?? 0

    if (type === 'TURN_START' && entry.turnNumber === 1 && wentFirstFromLog === null && p) {
      wentFirstFromLog = p
    }

    if (type === 'GAME_CONCEDED') {
      winner = d.winner ?? winner
      victoryReason = d.victoryReason ?? 'concession'
      concededBy = d.concededBy ?? null
    }

    if (type === 'GAME_END') {
      winner = d.winner ?? winner
      if (!victoryReason) victoryReason = d.victoryReason ?? null
    }

    if (!p) continue
    const pData = players[p]

    if (type === 'INITIAL_HAND') {
      pData.initialHand = (d.initialHandCards ?? []).filter(c => c?.name)
    }

    if (type === 'MULLIGAN') {
      pData.mulliganSent = (d.mulliganedCards ?? []).filter(c => c?.name)
      const sentIds = new Set(pData.mulliganSent.map(c => c.id))
      pData.mulliganKept = pData.initialHand.filter(c => !sentIds.has(c.id))
      pData.mulliganDrawn = (d.drawnCards ?? []).filter(c => c?.name)
    }

    const cardRefs = []
    if (d.cardName) cardRefs.push({ name: d.cardName, id: d.cardId })
    for (const arr of [d.initialHandCards, d.mulliganedCards, d.drawnCards, d.cards, d.keptCards, d.returnedCards]) {
      if (Array.isArray(arr)) arr.forEach(c => { if (c?.name) cardRefs.push({ name: c.name, id: c.id }) })
    }

    for (const card of cardRefs) {
      if (!card.name) continue
      const c = ensureCard(p, card.name, card.id)
      if (type === 'CARD_DRAWN') c.drawn++
      else if (type === 'CARD_PLAYED') c.played++
      else if (type === 'CARD_INKED') c.inked++
      else if (type === 'CARD_DISCARDED') c.discarded++
      else if (type === 'CARD_DESTROYED') c.destroyed++
    }

    if (type === 'CARD_QUEST' && d.cardName) {
      const gain = d.loreGained ?? 0
      ensureCard(p, d.cardName, d.cardId).loreGained += gain
      if (d.newLoreTotal != null) {
        loreByPlayer[p] = d.newLoreTotal
        loreEvents.push({ turn: entry.turnNumber ?? 0, player: p, total: d.newLoreTotal })
      }
    }

    if (type === 'CARD_ATTACK' && d.attackerBanished !== undefined) {
      challenges.push({
        turn: entry.turnNumber,
        player: p,
        attackerName: d.cardName,
        defenderName: d.targetCardName,
        attackerBanished: d.attackerBanished,
        defenderBanished: d.defenderBanished,
        attackerStrength: (d.attackerBaseStrength ?? 0) + (d.attackerChallengerBonus ?? 0),
        challengerBonus: d.attackerChallengerBonus ?? 0,
        defenderStrength: d.defenderBaseStrength ?? 0,
        attackerWillpower: d.attackerWillpower ?? 0,
        defenderWillpower: d.defenderWillpower ?? 0,
      })
    }

    if (type === 'CARD_BOOSTED' && d.cardName) {
      ensureCard(p, d.cardName, d.cardId).shiftPlays++
    }

    if (type === 'ABILITY_TRIGGERED' && d.abilitySourceCardName) {
      const c = ensureCard(p, d.abilitySourceCardName, d.abilitySourceCardId)
      for (const ek of (d.effectDescriptionKeys ?? [])) {
        if (ek.key === 'drawsACard' || ek.key === 'eachPlayerDrawsToHandSize') c.effectDraws++
        else if (ek.key === 'drawsCards') c.effectDraws += (ek.params?.count ?? 1)
        else if (ek.key === 'discardedCard') c.oppForcedDiscards++
        else if (ek.key === 'opponentDiscardsCards') c.oppForcedDiscards += (ek.params?.count ?? 1)
        else if (ek.key === 'grantsAnAdditionalInk') c.extraInks++
        else if (ek.key === 'movesDamageDetailedBanished' || ek.key === 'banishesTarget') c.effectRemovals++
        else if (ek.key === 'exertsCharacter') c.exerts++
        else if (ek.key === 'returnedFromDiscard') c.cardsRecovered += (d.returnedCardRefs?.length ?? 1)
      }
    }
  }

  const toList = (cardsMap) => Object.values(cardsMap).sort((a, b) => {
    const aTotal = a.drawn + a.played + a.inked
    const bTotal = b.drawn + b.played + b.inked
    return bTotal - aTotal || a.name.localeCompare(b.name)
  })

  // your_player directly identifies which seat is "you" — most reliable source
  let myPlayerNum = meta.yourPlayerNum ? Number(meta.yourPlayerNum) : null

  // Fallback: derive from win/loss + winner when your_player isn't available
  if (!myPlayerNum && meta.yourResult && winner !== null) {
    const winnerNum = winner === 1 || winner === '1' ? 1 : 2
    myPlayerNum = meta.yourResult === 'win' ? winnerNum : (winnerNum === 1 ? 2 : 1)
  }

  // Override names from match history API (authoritative — gamelog has no names)
  if (myPlayerNum && meta.opponentName) {
    if (myPlayerNum === 1) p2Name = meta.opponentName
    else p1Name = meta.opponentName
  }
  if (myPlayerNum && meta.yourDisplayName) {
    if (myPlayerNum === 1) p1Name = meta.yourDisplayName
    else p2Name = meta.yourDisplayName
  }

  const myInkCombo = myPlayerNum
    ? parseColors(myPlayerNum === 1 ? meta.yourColors : meta.oppColors)
    : []
  const oppInkCombo = myPlayerNum
    ? parseColors(myPlayerNum === 1 ? meta.oppColors : meta.yourColors)
    : []

  const wentFirst = meta.wentFirst != null
    ? (meta.wentFirst ? myPlayerNum : (myPlayerNum === 1 ? 2 : 1))
    : wentFirstFromLog

  return {
    id,
    p1Name,
    p2Name,
    winner,
    turnCount,
    eventCount: logs.length,
    victoryReason,
    concededBy,
    wentFirst,
    p1FinalLore: loreByPlayer[1] > 0 ? loreByPlayer[1] : null,
    p2FinalLore: loreByPlayer[2] > 0 ? loreByPlayer[2] : null,
    challenges,
    myPlayerNum,
    myInkCombo,
    oppInkCombo,
    loreEvents,
    yourDecklist: meta.yourDecklist ?? null,
    oppDecklist: meta.oppDecklist ?? null,
    playedAt: meta.startedAt ? new Date(meta.startedAt).getTime() : null,
    p1: { ...players[1], cardList: toList(players[1].cards) },
    p2: { ...players[2], cardList: toList(players[2].cards) },
  }
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

function ImportReplayButton({ game }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState(null) // null | 'loading' | 'done' | 'error'

  if (!game.replay_id) return null

  async function handleImport() {
    setStatus('loading')
    try {
      const buf = await fetchReplayBuffer(game.replay_id)
      const bytes = new Uint8Array(buf)
      const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('')
      const base64 = btoa(binary)
      sessionStorage.setItem('lorcana_pending_replay', JSON.stringify({
        base64,
        filename: game.replay_filename ?? `${game.replay_id}.replay.gz`,
      }))
      navigate('/replay-analyzer')
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
      title="Import replay into Replay Analyzer"
    >
      {status === 'loading' ? 'Importing…' : status === 'error' ? 'Failed' : '↗ Replay'}
    </button>
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
        oppDecklist: game.opp_decklist,
        startedAt: game.started_at,
      })
      await saveGamelog(id, parsed)
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

function GameRow({ game, selected, onToggle }) {
  const isSealed = game.queue_id?.toLowerCase().includes('sealed') || game.queue_name?.toLowerCase().includes('sealed')
  const id = game.game_id
  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${selected ? 'bg-blue-50 hover:bg-blue-50' : ''}`}
      onClick={() => onToggle(id)}
    >
      <td className="py-3 pl-3 pr-1" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(id)}
          className="rounded border-gray-300 text-gray-900 focus:ring-gray-400 cursor-pointer"
        />
      </td>
      <td className="py-3 px-3 text-sm text-gray-600 whitespace-nowrap">
        {formatDate(game.started_at)}
      </td>
      <td className="py-3 px-3 text-sm text-gray-700 hidden sm:table-cell max-w-[120px] truncate">
        {game.queue_name ?? '—'}
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
        {game.opp_display_name ?? '—'}
      </td>
      <td className="py-3 px-3 text-sm text-gray-700 whitespace-nowrap">
        {game.your_lore ?? '?'} – {game.opp_lore ?? '?'}
      </td>
      <td className="py-3 px-3 text-sm hidden sm:table-cell text-center">
        <MmrDelta delta={game.mmr_delta} />
      </td>
      <td className="py-3 px-3 hidden sm:table-cell" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <ImportReplayButton game={game} />
          <ImportGamelogButton game={game} />
        </div>
      </td>
    </tr>
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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">My Deck</span>
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
    </div>
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
  const [deckNames, setDeckNames] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DECK_NAMES_KEY) ?? '{}') } catch { return {} }
  })

  async function load({ cursor = null, append = false } = {}) {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await fetchMatchHistory({ cursor: cursor ?? undefined, limit: 100 })
      setGames(prev => append ? [...prev, ...(data.games ?? [])] : (data.games ?? []))
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
          oppDecklist: game.opp_decklist,
          startedAt: game.started_at,
        })
        await saveGamelog(game.gamelog_id, parsed)
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

  async function handleBulkImportReplays() {
    const toImport = games.filter(g => selected.has(g.game_id) && g.replay_id)
    if (!toImport.length) return
    setBulkOp({ done: 0, total: toImport.length, errors: 0, label: 'Importing replays' })
    let done = 0, errors = 0
    for (const game of toImport) {
      try {
        const buf = await fetchReplayBuffer(game.replay_id)
        const bytes = new Uint8Array(buf)
        const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('')
        const base64 = btoa(binary)
        // Queue replays in sessionStorage as an array for the replay analyzer to process
        const existing = JSON.parse(sessionStorage.getItem('lorcana_replay_queue') ?? '[]')
        existing.push({ base64, filename: game.replay_filename ?? `${game.replay_id}.replay.gz` })
        sessionStorage.setItem('lorcana_replay_queue', JSON.stringify(existing))
        done++
      } catch {
        errors++
      }
      setBulkOp({ done, total: toImport.length, errors, label: 'Importing replays' })
    }
    setSelected(new Set())
    navigate('/replay-analyzer')
  }

  // Derive unique filter options from all loaded games
  const queues = [...new Set(games.map(g => g.queue_name).filter(Boolean))].sort()
  const myColorOptions = [...new Set(games.map(g => g.your_deck_colors).filter(Boolean))].sort()
  const oppColorOptions = [...new Set(games.map(g => g.opp_deck_colors).filter(Boolean))].sort()

  // Derive unique decks by fingerprint
  const deckOptions = []
  const seenFingerprints = new Set()
  for (const g of games) {
    const fp = deckFingerprint(g.your_decklist)
    if (fp && !seenFingerprints.has(fp)) {
      seenFingerprints.add(fp)
      deckOptions.push({ fp, colors: g.your_deck_colors })
    }
  }

  function saveDeckName(fp, name) {
    const updated = { ...deckNames, [fp]: name.trim() }
    setDeckNames(updated)
    localStorage.setItem(DECK_NAMES_KEY, JSON.stringify(updated))
  }

  const filteredGames = games.filter(g => {
    if (filterQueue && g.queue_name !== filterQueue) return false
    if (filterMyColors && g.your_deck_colors !== filterMyColors) return false
    if (filterOppColors && g.opp_deck_colors !== filterOppColors) return false
    if (filterDeck && deckFingerprint(g.your_decklist) !== filterDeck) return false
    return true
  })

  const selectedGames = filteredGames.filter(g => selected.has(g.game_id))
  const hasGamelogs = selectedGames.some(g => g.gamelog_id)
  const hasReplays = selectedGames.some(g => g.replay_id)
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
            {hasReplays && (
              <button
                onClick={handleBulkImportReplays}
                className="px-3 py-1 bg-white text-gray-900 rounded text-xs font-semibold hover:bg-gray-100 transition-colors"
              >
                Import Replays ({selectedGames.filter(g => g.replay_id).length})
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
      {games.length > 0 && (queues.length > 1 || myColorOptions.length > 1 || oppColorOptions.length > 1 || deckOptions.length > 1) && (
        <div className="mb-4 flex flex-wrap gap-4 items-start">
          {queues.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Queue</span>
              {queues.map(q => (
                <button
                  key={q}
                  onClick={() => setFilterQueue(prev => prev === q ? null : q)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterQueue === q ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          {myColorOptions.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">My Colors</span>
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
            </div>
          )}
          {oppColorOptions.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Opp Colors</span>
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
            </div>
          )}
          {deckOptions.length > 1 && (
            <DeckFilterPills
              deckOptions={deckOptions}
              deckNames={deckNames}
              filterDeck={filterDeck}
              onSelect={fp => setFilterDeck(prev => prev === fp ? null : fp)}
              onRename={saveDeckName}
            />
          )}
          {(filterQueue || filterMyColors || filterOppColors || filterDeck) && (
            <button
              onClick={() => { setFilterQueue(null); setFilterMyColors(null); setFilterOppColors(null); setFilterDeck(null) }}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors self-center"
            >
              Clear filters · {filteredGames.length}/{games.length} shown
            </button>
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
              {filteredGames.map((game, i) => (
                <GameRow
                  key={game.game_id ?? i}
                  game={game}
                  selected={selected.has(game.game_id)}
                  onToggle={toggleSelect}
                />
              ))}
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

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getToken, fetchMatchHistory, fetchReplayBuffer, fetchGamelogBuffer } from '../lib/duelsApi'
import { saveGamelog } from '../lib/gamelogHistory'

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
      if (d.newLoreTotal != null) loreByPlayer[p] = d.newLoreTotal
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
    yourDecklist: meta.yourDecklist ?? null,
    oppDecklist: meta.oppDecklist ?? null,
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

function GameRow({ game }) {
  const isSealed = game.queue_id?.toLowerCase().includes('sealed') || game.queue_name?.toLowerCase().includes('sealed')
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
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
      <td className="py-3 px-3 text-sm text-gray-700 hidden sm:table-cell">
        <span className="inline-flex items-center gap-2">
          {!isSealed && game.opp_deck_colors && <InkIcons colors={game.opp_deck_colors} />}
          <span className="font-medium">{game.opp_display_name ?? '—'}</span>
        </span>
      </td>
      <td className="py-3 px-3 text-sm text-gray-700 whitespace-nowrap">
        {game.your_lore ?? '?'} – {game.opp_lore ?? '?'}
      </td>
      <td className="py-3 px-3 text-sm text-gray-500 hidden sm:table-cell text-center">
        {game.turns ?? '—'}
      </td>
      <td className="py-3 px-3 text-sm text-gray-500 hidden sm:table-cell whitespace-nowrap">
        {formatDuration(game.duration_seconds)}
      </td>
      <td className="py-3 px-3 text-sm hidden sm:table-cell text-center">
        <MmrDelta delta={game.mmr_delta} />
      </td>
      <td className="py-3 px-3 hidden sm:table-cell">
        <div className="flex flex-col gap-1">
          <ImportReplayButton game={game} />
          <ImportGamelogButton game={game} />
        </div>
      </td>
    </tr>
  )
}

export function MatchHistoryPage() {
  const hasToken = Boolean(getToken())
  const [games, setGames] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

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

      {games.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Queue</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Your Colors</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Opponent</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell text-center">Turns</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Duration</th>
                <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell text-center">MMR Δ</th>
                <th className="py-2 px-3 hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {games.map((game, i) => (
                <GameRow key={game.game_id ?? i} game={game} />
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

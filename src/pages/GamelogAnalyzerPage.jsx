import { useState, useEffect, useCallback } from 'react'
import { saveGamelog, getAllGamelogs, deleteGamelog, clearAllGamelogs } from '../lib/gamelogHistory'

const MY_NAME_KEY = 'lorcana_my_name'

// --- Parsing ---

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
  // Per-player lore tracked from CARD_QUEST.newLoreTotal (more reliable than GAME_END)
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

    // Who went first — first TURN_START at turn 1
    if (type === 'TURN_START' && entry.turnNumber === 1 && wentFirstFromLog === null && p) {
      wentFirstFromLog = p
    }

    // GAME_CONCEDED carries the full end state including victoryReason
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

    // Primary card ref from the event's own cardName field
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
      // newLoreTotal is the authoritative running lore for this player
      if (d.newLoreTotal != null) loreByPlayer[p] = d.newLoreTotal
    }

    // CARD_ATTACK comes in two events per challenge: the first has names only,
    // the second has full combat stats including banished flags — only use the second.
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

    // CARD_BOOSTED = Shift play (card played on top of another)
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

  // Override player names from match history API (authoritative — gamelog has no names)
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

  // wentFirst: prefer match history meta, fall back to first TURN_START in log
  const wentFirst = meta.wentFirst != null
    ? (meta.wentFirst ? myPlayerNum : (myPlayerNum === 1 ? 2 : 1))
    : wentFirstFromLog

  return {
    id,
    p1Name, p2Name,
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

// --- Data adapter ---

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
  // Prefer the myPlayerNum stored at import time (from Match History metadata)
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

// --- Aggregate helpers ---

function aggregateMyCards(games) {
  const map = {}
  for (const game of games) {
    for (const card of Object.values(game.myCards ?? {})) {
      const key = card.fullName
      if (!map[key]) {
        map[key] = {
          fullName: key, name: key,
          playedCount: 0, inkedCount: 0, loreGained: 0,
          effectDraws: 0, oppForcedDiscards: 0, extraInks: 0, effectRemovals: 0, exerts: 0, cardsRecovered: 0,
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

function aggregateCardWinRates(games) {
  const map = {}
  for (const game of games) {
    for (const card of Object.values(game.myCards ?? {})) {
      if (card.playedCount === 0 && card.inkedCount === 0) continue
      const key = card.fullName
      if (!map[key]) map[key] = { fullName: key, wins: 0, losses: 0 }
      if (game.won) map[key].wins++
      else map[key].losses++
    }
  }
  return Object.values(map)
}

// --- Shared UI primitives ---

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

function WinRateRow({ label, wins, losses }) {
  const total = wins + losses
  const pct = total > 0 ? Math.round((wins / total) * 100) : null
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <span className="flex-1 text-sm text-gray-700">{label}</span>
      <span className="text-sm font-bold text-gray-900 w-12 text-right">{wins}–{losses}</span>
      {pct !== null && (
        <span className={`text-xs font-semibold w-10 text-right ${pct >= 50 ? 'text-emerald-600' : 'text-red-500'}`}>{pct}%</span>
      )}
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

// --- Aggregate stat components ---

function WinRateStats({ enrichedGames }) {
  if (!enrichedGames.length) return null
  const tally = (subset) => ({ wins: subset.filter(g => g.won).length, losses: subset.filter(g => !g.won).length })
  const first = enrichedGames.filter(g => g.wentFirst)
  const second = enrichedGames.filter(g => !g.wentFirst)

  const hasInkData = enrichedGames.some(g => g.oppInkCombo?.length > 0)

  // Group by opponent ink combo when available, else by opponent name
  const byMatchup = {}
  for (const g of enrichedGames) {
    const key = g.oppInkCombo?.length ? g.oppInkCombo.join('/') : (g.opponentName || 'Unknown')
    if (!byMatchup[key]) byMatchup[key] = { label: key, colors: g.oppInkCombo ?? [], games: [] }
    byMatchup[key].games.push(g)
  }

  return (
    <Section collapsible title="Win Rate" subtitle={`${enrichedGames.length} game${enrichedGames.length !== 1 ? 's' : ''} recorded`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Overall</h3>
          <WinRateRow label="All games" {...tally(enrichedGames)} />
          <WinRateRow label="Going first" {...tally(first)} />
          <WinRateRow label="Going second" {...tally(second)} />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {hasInkData ? 'vs Matchup' : 'vs Opponent'}
          </h3>
          {Object.values(byMatchup).map(({ label, colors, games }) => (
            <WinRateRow
              key={label}
              label={
                colors.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    {colors.map(c => <InkDot key={c} color={c} />)}
                    <span>{colors.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join('/')}</span>
                  </span>
                ) : label
              }
              {...tally(games)}
            />
          ))}
        </div>
      </div>
    </Section>
  )
}

function CardWinRateTable({ games }) {
  const [minGames, setMinGames] = useState(2)
  const cards = aggregateCardWinRates(games)
  const filtered = cards
    .filter(c => c.wins + c.losses >= minGames)
    .sort((a, b) => {
      const pctA = a.wins / (a.wins + a.losses)
      const pctB = b.wins / (b.wins + b.losses)
      return pctB - pctA || (b.wins + b.losses) - (a.wins + a.losses)
    })

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Card Win Rate</h3>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">Min appearances:</span>
          {[2, 3, 5].map(n => (
            <button
              key={n}
              onClick={() => setMinGames(n)}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                minGames === n ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-500 hover:border-gray-500'
              }`}
            >{n}+</button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400">Not enough data — import more gamelogs.</p>
      ) : (
        <div className="text-sm">
          <div className="grid text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 gap-2" style={{ gridTemplateColumns: '1fr 2.5rem 2.5rem 2.5rem 5rem' }}>
            <span>Card</span>
            <span className="text-center">W</span>
            <span className="text-center">L</span>
            <span className="text-right">Win%</span>
            <span></span>
          </div>
          {filtered.map(c => {
            const total = c.wins + c.losses
            const pct = Math.round((c.wins / total) * 100)
            return (
              <div key={c.fullName} className="grid items-center gap-2 py-1.5 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 2.5rem 2.5rem 2.5rem 5rem' }}>
                <span className="text-gray-800 truncate">{c.fullName}</span>
                <span className="text-center font-semibold text-emerald-600">{c.wins}</span>
                <span className="text-center font-semibold text-red-400">{c.losses}</span>
                <span className={`text-right font-bold text-xs ${pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-gray-700' : 'text-red-500'}`}>{pct}%</span>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 70 ? 'bg-emerald-400' : pct >= 50 ? 'bg-gray-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DrawEffectsTable({ games }) {
  const cards = aggregateMyCards(games)
  const rows = cards
    .filter(c => (c.effectDraws + c.oppForcedDiscards + c.extraInks + c.effectRemovals + c.exerts + c.cardsRecovered) > 0)
    .sort((a, b) => {
      const score = c => c.effectDraws * 2 + c.oppForcedDiscards * 1.5 + c.extraInks + c.effectRemovals * 2 + c.exerts * 1.5 + c.cardsRecovered * 1.5
      return score(b) - score(a)
    })
    .slice(0, 10)

  if (!rows.length) return <p className="text-sm text-gray-400">No effect data in these gamelogs.</p>

  return (
    <div className="text-sm">
      <div className="grid text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 gap-2" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem 3rem 3rem' }}>
        <span>Card</span>
        <span className="text-center text-blue-500">Draw</span>
        <span className="text-center text-purple-500">Discard</span>
        <span className="text-center text-amber-500">+Ink</span>
        <span className="text-center text-red-500">Remove</span>
        <span className="text-center text-orange-500">Exert</span>
        <span className="text-center text-teal-500">Recover</span>
      </div>
      {rows.map(c => (
        <div key={c.fullName} className="grid items-center gap-2 py-1.5 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 3rem 3rem 3rem 3rem 3rem 3rem' }}>
          <span className="text-gray-700 truncate">{c.fullName}</span>
          <span className="text-center font-semibold text-blue-500">{c.effectDraws || '—'}</span>
          <span className="text-center font-semibold text-purple-500">{c.oppForcedDiscards || '—'}</span>
          <span className="text-center font-semibold text-amber-500">{c.extraInks || '—'}</span>
          <span className="text-center font-semibold text-red-500">{c.effectRemovals || '—'}</span>
          <span className="text-center font-semibold text-orange-500">{c.exerts || '—'}</span>
          <span className="text-center font-semibold text-teal-500">{c.cardsRecovered || '—'}</span>
        </div>
      ))}
      <p className="text-[10px] text-gray-400 mt-1.5">Draw = effect draws · Discard = forced opp discards · +Ink = extra ink · Remove = banished/inkwelled · Exert = opp exerted · Recover = from discard</p>
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
        if (c.ch.kills > 0) tags.push(`${c.ch.kills} kills`)
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
    <Section collapsible defaultOpen title="Deck Stats" subtitle={subtitle}>
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
          <p className="text-[10px] text-gray-400 mb-1.5">Count · % of opening hand appearances</p>
          <MulliganTable rows={topSentBack} emptyText="No mulligan data." />
        </div>
      </div>
      {filteredGames.length > 1 && <CardWinRateTable games={filteredGames} />}
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
              <p className="text-[10px] text-gray-400 mb-2">Plays · score: lore + draws + kills + removal</p>
              <ImpactTable games={filteredGames} order="desc" />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Least Impactful Cards</h3>
              <p className="text-[10px] text-gray-400 mb-2">Plays · score: lore + draws + kills + removal</p>
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

function InkDot({ color }) {
  const DOT = { amber: 'bg-amber-400', amethyst: 'bg-purple-500', emerald: 'bg-emerald-500', ruby: 'bg-red-500', sapphire: 'bg-blue-500', steel: 'bg-gray-400' }
  const c = DOT[color?.toLowerCase()]
  if (!c) return null
  return <span className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${c}`} title={color} />
}

function AggregateView({ enrichedGames }) {
  const [matchupFilter, setMatchupFilter] = useState(null)
  const [oppFilter, setOppFilter] = useState(null)
  if (!enrichedGames.length) return null

  // Build matchup filter entries (by opponent ink combo when available)
  const hasInkData = enrichedGames.some(g => g.oppInkCombo?.length > 0)
  const matchups = []
  const seenMatchups = new Set()
  for (const g of enrichedGames) {
    const key = g.oppInkCombo?.length ? g.oppInkCombo.join('/') : null
    if (key && !seenMatchups.has(key)) { seenMatchups.add(key); matchups.push({ key, colors: g.oppInkCombo }) }
  }

  // Build opponent name filter entries
  const opponents = []
  const seenOpps = new Set()
  for (const g of enrichedGames) {
    const key = g.opponentName || 'Unknown'
    if (!seenOpps.has(key)) { seenOpps.add(key); opponents.push(key) }
  }

  const filtered = enrichedGames.filter(g => {
    if (matchupFilter && (g.oppInkCombo?.join('/') || null) !== matchupFilter) return false
    if (oppFilter && (g.opponentName || 'Unknown') !== oppFilter) return false
    return true
  })

  const activeFilters = [matchupFilter, oppFilter].filter(Boolean)
  const subtitle = activeFilters.length
    ? `${filtered.length} game${filtered.length !== 1 ? 's' : ''} filtered · ${enrichedGames.length} total`
    : `Aggregated across ${enrichedGames.length} game${enrichedGames.length !== 1 ? 's' : ''}`

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        {hasInkData && matchups.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">vs matchup:</span>
            <button
              onClick={() => setMatchupFilter(null)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                matchupFilter === null ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'
              }`}
            >All</button>
            {matchups.map(({ key, colors }) => (
              <button
                key={key}
                onClick={() => setMatchupFilter(matchupFilter === key ? null : key)}
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  matchupFilter === key ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'
                }`}
              >
                {colors.map(c => <InkDot key={c} color={matchupFilter === key ? null : c} />)}
                <span>{colors.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join('/')}</span>
              </button>
            ))}
          </div>
        )}
        {opponents.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">vs opponent:</span>
            <button
              onClick={() => setOppFilter(null)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                oppFilter === null ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'
              }`}
            >All</button>
            {opponents.map(name => (
              <button
                key={name}
                onClick={() => setOppFilter(oppFilter === name ? null : name)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  oppFilter === name ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'
                }`}
              >{name}</button>
            ))}
          </div>
        )}
      </div>
      <DeckStats filteredGames={filtered} subtitle={subtitle} />
      <ChallengeStats filteredGames={filtered} subtitle={subtitle} />
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

function resolveDisplayName(storedName, isMe, myName) {
  if (storedName !== 'Player 1' && storedName !== 'Player 2') return storedName
  if (isMe && myName) return myName
  return storedName
}

function GamelogDetail({ gamelog, myPlayerNum, myName = '' }) {
  const { p1Name: rawP1Name, p2Name: rawP2Name, winner, turnCount, eventCount, p1FinalLore, p2FinalLore, p1, p2, victoryReason, wentFirst } = gamelog
  const p1Name = resolveDisplayName(rawP1Name, myPlayerNum === 1, myName)
  const p2Name = resolveDisplayName(rawP2Name, myPlayerNum === 2, myName)
  const p1IsWinner = winner === 1 || winner === '1'
  const p2IsWinner = winner === 2 || winner === '2'
  const winnerName = p1IsWinner ? p1Name : p2IsWinner ? p2Name : null

  const metaBits = []
  if (turnCount) metaBits.push(`${turnCount} turns`)
  if (eventCount) metaBits.push(`${eventCount} events`)
  if (wentFirst != null) {
    const firstName = wentFirst === 1 ? p1Name : p2Name
    metaBits.push(`${firstName} went first`)
  }
  if (victoryReason && victoryReason !== 'normal') metaBits.push(victoryReason)

  return (
    <div className="mt-8">
      <div className="border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h2 className="text-lg font-bold text-gray-900">{p1Name} vs {p2Name}</h2>
          {winnerName && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">
              {winnerName} wins
            </span>
          )}
        </div>
        <div className="text-sm text-gray-500">{metaBits.join(' · ')}</div>
      </div>

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
    </div>
  )
}

// --- Main page ---

export function GamelogAnalyzerPage() {
  const [gamelogs, setGamelogs] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [myName, setMyName] = useState(() => localStorage.getItem(MY_NAME_KEY) ?? '')
  const [nameInput, setNameInput] = useState(() => localStorage.getItem(MY_NAME_KEY) ?? '')

  const activeGamelog = gamelogs.find(g => g.id === activeId) ?? null
  const enrichedGames = gamelogs.flatMap(g => { const e = enrichGame(g, myName); return e ? [e] : [] })
  const activeMyPlayerNum = activeGamelog
    ? (activeGamelog.myPlayerNum ?? getMyPlayerNum(activeGamelog, myName))
    : null

  function saveName(name) {
    const trimmed = name.trim()
    setMyName(trimmed)
    localStorage.setItem(MY_NAME_KEY, trimmed)
  }

  async function processBuffer(arrayBuffer, filename) {
    const text = await decompressGzip(arrayBuffer)
    const logs = JSON.parse(text)
    const id = filename.replace(/\.logs\.gz$/i, '').replace(/\.gz$/i, '') || crypto.randomUUID()
    const parsed = parseGamelog(id, logs)
    const record = await saveGamelog(id, parsed)
    setGamelogs(prev => {
      const filtered = prev.filter(g => g.id !== id)
      return [record, ...filtered].sort((a, b) => b.savedAt - a.savedAt)
    })
    setActiveId(id)
    return record
  }

  async function processFiles(files) {
    setLoading(true)
    setError(null)
    try {
      for (const file of files) {
        if (!file.name.endsWith('.gz')) continue
        const buf = await file.arrayBuffer()
        await processBuffer(buf, file.name)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getAllGamelogs().then(all => setGamelogs(all)).catch(() => {})

    const pending = sessionStorage.getItem('lorcana_pending_gamelog')
    if (pending) {
      sessionStorage.removeItem('lorcana_pending_gamelog')
      try {
        const { base64, filename } = JSON.parse(pending)
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        setLoading(true)
        processBuffer(bytes.buffer, filename).catch(e => setError(e.message)).finally(() => setLoading(false))
      } catch (e) {
        setError(e.message)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(id) {
    await deleteGamelog(id)
    setGamelogs(prev => prev.filter(g => g.id !== id))
    if (activeId === id) setActiveId(null)
  }

  async function handleClearAll() {
    if (!window.confirm(`Delete all ${gamelogs.length} gamelogs? This cannot be undone.`)) return
    await clearAllGamelogs()
    setGamelogs([])
    setActiveId(null)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) processFiles(files)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true) }, [])
  const handleDragLeave = useCallback(() => setDragOver(false), [])

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Gamelog Analyzer</h1>
        <p className="text-sm text-gray-500">Import .logs.gz files or use the ↗ Gamelog button from Match History.</p>
      </div>

      {/* Player name setting */}
      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Your player name:</label>
        <input
          type="text"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onBlur={() => saveName(nameInput)}
          onKeyDown={e => { if (e.key === 'Enter') { saveName(nameInput); e.currentTarget.blur() } }}
          placeholder="Enter your name to enable win rate stats"
          className="flex-1 min-w-48 text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder:text-gray-300"
        />
        {myName && gamelogs.length > 0 && enrichedGames.length === 0 && (
          <span className="text-xs text-orange-600">Name not found — try matching exactly as it appears in gamelogs</span>
        )}
        {enrichedGames.length > 0 && (
          <span className="text-xs text-emerald-600">{enrichedGames.length}/{gamelogs.length} games tracked</span>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}
      >
        <label className="cursor-pointer flex flex-col items-center gap-2">
          <input
            type="file"
            accept=".gz"
            multiple
            className="sr-only"
            onChange={e => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) processFiles(files)
              e.target.value = ''
            }}
          />
          <span className="text-sm text-gray-600">Drop .logs.gz files here or click to upload</span>
          <span className="text-xs text-gray-400">Accepts .logs.gz files · duplicates are skipped</span>
        </label>
      </div>

      {loading && <div className="mt-4 text-sm text-gray-500">Parsing gamelogs…</div>}
      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

      {/* Aggregate stats */}
      {enrichedGames.length > 0 && (
        <div className="mt-8">
          <WinRateStats enrichedGames={enrichedGames} />
          {enrichedGames.length > 1 && <AggregateView enrichedGames={enrichedGames} />}
        </div>
      )}

      {/* Saved list */}
      {gamelogs.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{gamelogs.length} game{gamelogs.length !== 1 ? 's' : ''}</span>
            <button
              onClick={handleClearAll}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="space-y-1">
          {gamelogs.map(g => (
            <div
              key={g.id}
              onClick={() => setActiveId(g.id)}
              className={`cursor-pointer flex items-center gap-3 px-3 py-2 rounded transition-colors ${activeId === g.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}
            >
              <span className="font-medium text-sm">
                {resolveDisplayName(g.p1Name, g.myPlayerNum === 1, myName)} vs {resolveDisplayName(g.p2Name, g.myPlayerNum === 2, myName)}
              </span>
              <span className="text-xs opacity-60">{g.turnCount} turns · {g.eventCount} events</span>
              <span className="ml-auto text-xs opacity-60">{new Date(g.savedAt).toLocaleDateString()}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(g.id) }}
                className="text-xs opacity-40 hover:opacity-100 transition-opacity"
                title="Delete gamelog"
              >✕</button>
            </div>
          ))}
          </div>
        </div>
      )}

      {activeGamelog && <GamelogDetail gamelog={activeGamelog} myPlayerNum={activeMyPlayerNum} myName={myName} />}

      {gamelogs.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400 text-sm">No gamelogs yet — import a .logs.gz file to get started.</div>
      )}
    </div>
  )
}

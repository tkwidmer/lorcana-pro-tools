import { useState, useEffect, useCallback, useMemo } from 'react'
import { saveGamelog, getAllGamelogs, deleteGamelog, clearAllGamelogs } from '../lib/gamelogHistory'
import { decompressGzip, parseGamelog } from '../lib/parseGamelog'
import { createGameExportZip } from '../lib/gameExport'
import { detectLeaks, summarizeLeaks, LEAK_TYPES } from '../lib/leakDetection'
import { getTokens } from '../lib/duelsApi'

const MY_NAME_KEY = 'lorcana_my_name'

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
      sings: card.sings ?? 0,
      oppRestrictions: card.oppRestrictions ?? 0,
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
          effectDraws: 0, oppForcedDiscards: 0, extraInks: 0, effectRemovals: 0, exerts: 0, cardsRecovered: 0, sings: 0, oppRestrictions: 0,
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
  const [expanded, setExpanded] = useState(new Set())
  if (!enrichedGames.length) return null
  const toggle = (key) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const tally = (subset) => ({ wins: subset.filter(g => g.won).length, losses: subset.filter(g => !g.won).length })
  const first = enrichedGames.filter(g => g.wentFirst)
  const second = enrichedGames.filter(g => !g.wentFirst)

  // Match-level win rate for BO3 games
  const bo3Games = enrichedGames.filter(g => g.match_id)
  const matchGroups = {}
  for (const g of bo3Games) {
    if (!matchGroups[g.match_id]) matchGroups[g.match_id] = []
    matchGroups[g.match_id].push(g)
  }
  const completeMatches = Object.values(matchGroups).filter(games => {
    const wins = games.filter(g => g.won).length
    const losses = games.filter(g => !g.won).length
    return wins >= 2 || losses >= 2
  })
  const matchWins = completeMatches.filter(games => games.filter(g => g.won).length >= 2).length
  const matchLosses = completeMatches.filter(games => games.filter(g => !g.won).length >= 2).length

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
          {completeMatches.length > 0 && (
            <WinRateRow label={<span className="text-gray-500">BO3 matches</span>} wins={matchWins} losses={matchLosses} />
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {hasInkData ? 'vs Matchup' : 'vs Opponent'}
          </h3>
          {Object.values(byMatchup).map(({ label, colors, games }) => {
            const isOpen = expanded.has(label)
            const firstGames = games.filter(g => g.wentFirst)
            const secondGames = games.filter(g => !g.wentFirst)
            const hasBreakdown = firstGames.length > 0 || secondGames.length > 0
            const matchupLabel = (
              <button
                onClick={() => hasBreakdown && toggle(label)}
                className={`inline-flex items-center gap-1.5 ${hasBreakdown ? 'cursor-pointer hover:text-gray-900' : 'cursor-default'}`}
              >
                {colors.length > 0
                  ? <>{colors.map(c => <InkDot key={c} color={c} />)}<span>{colors.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join('/')}</span></>
                  : <span>{label}</span>
                }
                {hasBreakdown && (
                  <svg className={`w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>
            )
            return (
              <div key={label}>
                <WinRateRow label={matchupLabel} {...tally(games)} />
                {isOpen && (
                  <div className="pl-4 border-l-2 border-gray-100 ml-1 mb-1">
                    {firstGames.length > 0 && <WinRateRow label={<span className="text-gray-400">Going first</span>} {...tally(firstGames)} />}
                    {secondGames.length > 0 && <WinRateRow label={<span className="text-gray-400">Going second</span>} {...tally(secondGames)} />}
                  </div>
                )}
              </div>
            )
          })}
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

function InkDot({ color }) {
  const DOT = { amber: 'bg-amber-400', amethyst: 'bg-purple-500', emerald: 'bg-emerald-500', ruby: 'bg-red-500', sapphire: 'bg-blue-500', steel: 'bg-gray-400' }
  const c = DOT[color?.toLowerCase()]
  if (!c) return null
  return <span className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${c}`} title={color} />
}

export function InkImg({ color, size = 'w-4 h-4' }) {
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
          // Pull the specific instances from each game for the expanded view
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

function LoreChart({ loreEvents, turnCount, p1Name, p2Name }) {
  if (!loreEvents?.length) return null

  // Build per-turn lore totals for each player
  const maxTurn = Math.max(turnCount, ...loreEvents.map(e => e.turn))
  const p1Lore = new Array(maxTurn + 1).fill(0)
  const p2Lore = new Array(maxTurn + 1).fill(0)

  // Fill forward: each turn holds the highest lore total reached by that turn
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

  // Win threshold line at 20
  const winY = y(20)

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Lore Race</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 140 }}>
        {/* Grid lines */}
        {[0, 5, 10, 15, 20].map(v => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth="0.5" />
            <text x={PAD.left - 4} y={y(v) + 3.5} textAnchor="end" fontSize="7" fill="#9ca3af">{v}</text>
          </g>
        ))}
        {/* Win line */}
        <line x1={PAD.left} x2={W - PAD.right} y1={winY} y2={winY} stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />

        {/* Lore lines */}
        <path d={pathFor(p2Lore)} fill="none" stroke="#f87171" strokeWidth="2" strokeLinejoin="round" />
        <path d={pathFor(p1Lore)} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />

        {/* Turn labels */}
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

  // Add any observed opponent cards not captured in the decklist
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

  // Group events by turn
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

    // Create turn-wise breakdown: distribute actions across turns
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
    <div className="mt-8">
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

// --- Main page ---

export function GamelogAnalyzerPage() {
  const [gamelogs, setGamelogs] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [myName, setMyName] = useState(() => localStorage.getItem(MY_NAME_KEY) ?? '')
  const [nameInput, setNameInput] = useState(() => localStorage.getItem(MY_NAME_KEY) ?? '')

  const userIdToLabel = useMemo(() => {
    const map = {}
    for (const t of getTokens()) if (t.userId) map[t.userId] = t.username || t.label
    return map
  }, [])

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
    const record = await saveGamelog(id, parsed, logs)
    setGamelogs(prev => {
      const filtered = prev.filter(g => g.id !== id)
      return [record, ...filtered].sort((a, b) => (b.playedAt ?? b.savedAt) - (a.playedAt ?? a.savedAt))
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
    getAllGamelogs().then(all => setGamelogs([...all].sort((a, b) => b.savedAt - a.savedAt))).catch(() => {})

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
        processBuffer(bytes.buffer, filename).catch(e => setError(e.message)).finally(() => setLoading(false))
      } catch (e) {
        setError(e.message)
      }
    }
  }, [])

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
          {myName && gamelogs.length > 0 && enrichedGames.length === 0 && (
            <span className="text-xs text-orange-600">Name not found — try matching exactly as it appears in gamelogs</span>
          )}
          {enrichedGames.length > 0 && (
            <span className="text-xs text-emerald-600">{enrichedGames.length}/{gamelogs.length} games tracked</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Only needed for <span className="font-medium">.logs.gz files imported directly</span> — games imported from Match History already know which side is you.
        </p>
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
          <LeakReport enrichedGames={enrichedGames} />
          {enrichedGames.length > 1 && <AggregateView enrichedGames={enrichedGames} />}
        </div>
      )}

      {/* Saved list */}
      {gamelogs.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{gamelogs.length} game{gamelogs.length !== 1 ? 's' : ''}</span>
            <div className="flex gap-2">
              <button
                onClick={() => createGameExportZip(gamelogs, 'lorcana-games')}
                className="text-xs text-blue-400 hover:text-blue-600 transition-colors"
              >
                Export all
              </button>
              <button
                onClick={handleClearAll}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>
          <div className="space-y-1">
          {gamelogs.map(g => {
            const isActive = activeId === g.id
            const myNum = g.myPlayerNum
            const won = myNum != null && (g.winner === myNum || g.winner === String(myNum))
            const myDisplayName = resolveDisplayName(myNum === 1 ? g.p1Name : g.p2Name, true, myName)
            const oppDisplayName = myNum === 1 ? g.p2Name : myNum === 2 ? g.p1Name : null
            const tokenLabel = g.userId ? userIdToLabel[g.userId] : null
            const myDisplayLabel = tokenLabel ?? (myNum
              ? myDisplayName
              : resolveDisplayName(g.p1Name, false, myName))
            const oppDisplayLabel = myNum
              ? (oppDisplayName ?? '?')
              : resolveDisplayName(g.p2Name, false, myName)
            const myColors = myNum ? g.myInkCombo : (g.myInkCombo ?? [])
            const oppColors = myNum ? g.oppInkCombo : (g.oppInkCombo ?? [])
            return (
              <div
                key={g.id}
                onClick={() => setActiveId(g.id)}
                className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded transition-colors ${isActive ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}
              >
                {myNum != null && (
                  <span className={`text-[10px] font-bold w-6 text-center flex-shrink-0 ${isActive ? (won ? 'text-emerald-400' : 'text-red-400') : (won ? 'text-emerald-600' : 'text-red-500')}`}>
                    {won ? 'W' : 'L'}
                  </span>
                )}
                <span className="flex items-center gap-1 font-medium text-sm flex-1 min-w-0">
                  <span className="truncate">{myDisplayLabel}</span>
                  {myColors?.length > 0 && (
                    <span className="flex items-center gap-0.5 flex-shrink-0">
                      {myColors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
                    </span>
                  )}
                  {g.deckName && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 max-w-[80px] truncate ${isActive ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                      {g.deckName}
                    </span>
                  )}
                  <span className={`text-xs flex-shrink-0 ${isActive ? 'text-gray-400' : 'text-gray-400'}`}>vs</span>
                  <span className="truncate">{oppDisplayLabel}</span>
                  {oppColors?.length > 0 && (
                    <span className="flex items-center gap-0.5 flex-shrink-0">
                      {oppColors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />)}
                    </span>
                  )}
                </span>
                {g.match_game_number && (
                  <span className={`text-[10px] font-medium flex-shrink-0 px-1 py-0.5 rounded ${isActive ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                    G{g.match_game_number}
                  </span>
                )}
                <span className={`text-xs flex-shrink-0 ${isActive ? 'opacity-60' : 'text-gray-400'}`}>{g.turnCount}T</span>
                <span className={`text-xs flex-shrink-0 ${isActive ? 'opacity-60' : 'text-gray-400'}`}>{new Date(g.playedAt ?? g.savedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); createGameExportZip([g], `lorcana-${g.id}`) }}
                  className="text-xs opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
                  title="Export game"
                >⬇</button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(g.id) }}
                  className="text-xs opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
                  title="Delete gamelog"
                >✕</button>
              </div>
            )
          })}
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

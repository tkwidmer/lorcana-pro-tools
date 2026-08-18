import { useState } from 'react'
import { aggregateMyCards, aggregateMulliganSentBack } from '../../lib/analyticsAggregation'

// --- Personal analysis components (win rate breakdowns, card/mulligan stats, leaks, single-game drilldown) ---

export function Section({ title, subtitle, children, collapsible, defaultOpen = true }) {
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

export function StatTable({ rows, valueKey, emptyText }) {
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

export function MulliganTable({ rows, emptyText }) {
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

export function DrawEffectsTable({ games }) {
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

export function ImpactTable({ games, order }) {
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
        c.oppLoreLoss * 2 +
        c.damageHealed * 0.5 +
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
        if (c.oppLoreLoss > 0) tags.push(`${c.oppLoreLoss} opp lore loss`)
        if (c.damageHealed > 0) tags.push(`${c.damageHealed} dmg healed`)
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

export function DeckStats({ filteredGames, subtitle }) {
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

export function CrossGameChallengers({ games }) {
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

export function CrossGameDefenders({ games }) {
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

export function ChallengeStats({ filteredGames, subtitle }) {
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

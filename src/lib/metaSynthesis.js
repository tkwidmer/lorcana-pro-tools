// Turns a raw /api/stats/meta response (see archetypeStats.js for the shape
// duels.ink returns) into a plain-English synthesis: what's most played,
// what's winning, and how that shifts across rank bands and over time. Pure
// functions only so this stays unit-testable independent of
// MetaSynthesisPage's fetching/UI.

import { getCuratedArchetypes } from './archetypeStats'

// duels.ink's clustering algorithm splits one conceptual archetype (e.g.
// "Amber/Amethyst Midrange") into several profile rows — one per detected
// build variant — each with its own signature cards and win rate. For a
// high-level synthesis those variants should read as one archetype, so this
// groups profiles by colors + archetypeName and sums their games/wins.
export function aggregateArchetypes(profiles) {
  const groups = new Map()
  for (const p of getCuratedArchetypes(profiles)) {
    const key = `${[...p.colors].sort().join('/')}|${p.archetypeName}`
    const existing = groups.get(key)
    if (existing) {
      existing.gamesPlayed += p.gamesPlayed
      existing.wins += p.wins
      existing.variantCount += 1
      existing.ids.push(p.id)
    } else {
      groups.set(key, {
        key,
        name: `${p.colors.map(c => c[0].toUpperCase() + c.slice(1)).join('/')} ${p.archetypeName}`,
        archetypeName: p.archetypeName,
        colors: p.colors,
        gamesPlayed: p.gamesPlayed,
        wins: p.wins,
        variantCount: 1,
        ids: [p.id],
      })
    }
  }
  return [...groups.values()].map(g => ({
    ...g,
    winRate: g.gamesPlayed > 0 ? (g.wins / g.gamesPlayed) * 100 : 0,
  }))
}

function withPlayRate(archetypes, totalGames) {
  return archetypes.map(a => ({
    ...a,
    playRate: totalGames > 0 ? (a.gamesPlayed / totalGames) * 100 : 0,
  }))
}

// Reliability floor for ranking by win rate — duels.ink's own
// `archetypeMinDisplayGames` (falls back to 50) with a bit of headroom,
// since a small-sample archetype can swing wildly on win rate alone.
export function winRateSampleFloor(stats) {
  return Math.max((stats?.meta?.archetypeMinDisplayGames ?? 50) * 2, 100)
}

export function topPlayedArchetypes(stats, { limit = 5 } = {}) {
  const totalGames = stats?.activity?.totalGames ?? 0
  return withPlayRate(aggregateArchetypes(stats?.profiles), totalGames)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
    .slice(0, limit)
}

export function topWinRateArchetypes(stats, { limit = 5, minGames } = {}) {
  const totalGames = stats?.activity?.totalGames ?? 0
  const floor = minGames ?? winRateSampleFloor(stats)
  return withPlayRate(aggregateArchetypes(stats?.profiles), totalGames)
    .filter(a => a.gamesPlayed >= floor)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, limit)
}

export function bottomWinRateArchetypes(stats, { limit = 3, minGames } = {}) {
  const totalGames = stats?.activity?.totalGames ?? 0
  const floor = minGames ?? winRateSampleFloor(stats)
  return withPlayRate(aggregateArchetypes(stats?.profiles), totalGames)
    .filter(a => a.gamesPlayed >= floor)
    .sort((a, b) => a.winRate - b.winRate)
    .slice(0, limit)
}

// Every archetype with enough games to be worth naming — used to populate
// the "Pick your deck" selector. Sorted by play rate desc.
export function listReliableArchetypes(stats, { minGames } = {}) {
  const totalGames = stats?.activity?.totalGames ?? 0
  const floor = minGames ?? (stats?.meta?.archetypeMinDisplayGames ?? 50)
  return withPlayRate(aggregateArchetypes(stats?.profiles), totalGames)
    .filter(a => a.gamesPlayed >= floor)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
}

// Head-to-head record for one aggregated archetype against every other
// archetype it has faced, rolling duels.ink's per-build-variant
// `archetypeMatchups` rows up to the same colors+archetypeName grouping
// `aggregateArchetypes` uses everywhere else. Returns null if `archetypeKey`
// isn't a known archetype in this stats response.
export function archetypeMatchupSummary(stats, archetypeKey, { minGames = 30 } = {}) {
  const aggregates = aggregateArchetypes(stats?.profiles)
  const idToKey = new Map()
  for (const a of aggregates) for (const id of a.ids) idToKey.set(id, a.key)
  const keyToName = new Map(aggregates.map(a => [a.key, a.name]))
  if (!keyToName.has(archetypeKey)) return null

  const totals = new Map() // opponentKey -> { games, wins }
  for (const m of stats?.archetypeMatchups ?? []) {
    const keyA = idToKey.get(m.archetypeIdA)
    const keyB = idToKey.get(m.archetypeIdB)
    if (keyA === archetypeKey && keyB) {
      const t = totals.get(keyB) ?? { games: 0, wins: 0 }
      t.games += m.games
      t.wins += m.winsA
      totals.set(keyB, t)
    } else if (keyB === archetypeKey && keyA && keyA !== keyB) {
      const t = totals.get(keyA) ?? { games: 0, wins: 0 }
      t.games += m.games
      t.wins += (m.games - m.winsA)
      totals.set(keyA, t)
    }
  }

  const rows = [...totals.entries()]
    .map(([key, t]) => ({
      key,
      name: keyToName.get(key) ?? key,
      games: t.games,
      winRate: t.games > 0 ? (t.wins / t.games) * 100 : 0,
      isMirror: key === archetypeKey,
    }))
    .filter(r => r.games >= minGames)
    .sort((a, b) => b.games - a.games)

  const ranked = rows.filter(r => !r.isMirror).sort((a, b) => b.winRate - a.winRate)
  const mirror = rows.find(r => r.isMirror) ?? null

  return {
    rows,
    best: ranked[0] ?? null,
    worst: ranked.length > 0 ? ranked[ranked.length - 1] : null,
    mirror,
  }
}

// The cards most correlated with winning inside one archetype (duels.ink's
// per-card "lift" stat). Pulled from whichever build-variant profile in the
// aggregated group has the largest sample, since lift isn't meaningfully
// additive across variants the way games/wins are.
export function topSignatureCards(stats, archetypeKey, { limit = 3, resolveName = id => id } = {}) {
  const aggregates = aggregateArchetypes(stats?.profiles)
  const agg = aggregates.find(a => a.key === archetypeKey)
  if (!agg) return []

  const variants = (stats?.profiles ?? []).filter(p => agg.ids.includes(p.id))
  const representative = variants.sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]

  return (representative?.cardLift ?? [])
    .filter(c => c.lift > 0)
    .sort((a, b) => b.lift - a.lift)
    .slice(0, limit)
    .map(c => ({
      cardId: c.cardId,
      name: resolveName(c.cardId),
      lift: c.lift,
      winRateWith: c.winRateWith,
      presence: c.presence,
    }))
}

function pct(n, digits = 1) {
  return `${n.toFixed(digits)}%`
}

function listNames(archetypes) {
  return archetypes.map(a => a.name)
}

function joinEnglish(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

// Builds the plain-text synthesis paragraphs shown on MetaSynthesisPage.
// `context` = { queueLabel, periodLabel, bandLabel, focusArchetypeKey,
// resolveCardName }. When `focusArchetypeKey` names a known archetype, two
// extra paragraphs are appended covering its matchup spread and signature
// cards — otherwise the synthesis stays a general meta overview.
export function buildSynthesis(stats, context = {}) {
  const {
    queueLabel = 'this queue',
    periodLabel = 'this period',
    bandLabel = 'all ranks',
    focusArchetypeKey = null,
    resolveCardName = id => id,
  } = context
  const totalGames = stats?.activity?.totalGames ?? 0
  const paragraphs = []

  if (!totalGames) {
    return {
      paragraphs: ['No games recorded for this queue, period, and rank band yet.'],
      topPlayed: [], topWinRate: [], underperformers: [], focusMatchups: null, focusCards: [],
    }
  }

  const topPlayed = topPlayedArchetypes(stats, { limit: 5 })
  const topWinRate = topWinRateArchetypes(stats, { limit: 5 })
  const underperformers = bottomWinRateArchetypes(stats, { limit: 3 })

  paragraphs.push(
    `${totalGames.toLocaleString()} games played in ${queueLabel} during ${periodLabel} among ${bandLabel}` +
    (stats?.activity?.uniquePlayers ? `, across ${stats.activity.uniquePlayers.toLocaleString()} players.` : '.')
  )

  if (topPlayed.length > 0) {
    const top = topPlayed[0]
    const rest = topPlayed.slice(1, 4)
    let sentence = `${top.name} is the most-played archetype at ${pct(top.playRate)} of games, sitting at ${pct(top.winRate)} win rate.`
    if (rest.length > 0) {
      sentence += ` Also seeing significant play: ${joinEnglish(rest.map(a => `${a.name} (${pct(a.playRate)}, ${pct(a.winRate)} win rate)`))}.`
    }
    paragraphs.push(sentence)
  }

  if (topWinRate.length > 0) {
    const best = topWinRate[0]
    const isAlsoTopPlayed = topPlayed[0]?.key === best.key
    let sentence = isAlsoTopPlayed
      ? `${best.name} isn't just the most popular deck — it also leads on win rate at ${pct(best.winRate)}.`
      : `${best.name} has the best win rate among established decks at ${pct(best.winRate)}, on ${pct(best.playRate)} play rate.`
    const others = topWinRate.slice(1, 4).filter(a => a.key !== topPlayed[0]?.key)
    if (others.length > 0) {
      sentence += ` Right behind it: ${joinEnglish(others.map(a => `${a.name} (${pct(a.winRate)})`))}.`
    }
    paragraphs.push(sentence)
  }

  if (underperformers.length > 0) {
    const worst = underperformers[0]
    if (worst.winRate < 50) {
      const heavilyPlayedButLosing = underperformers.filter(a => a.playRate >= 3 && a.winRate < 49)
      if (heavilyPlayedButLosing.length > 0) {
        paragraphs.push(
          `Despite meaningful play, ${joinEnglish(listNames(heavilyPlayedButLosing))} ` +
          `${heavilyPlayedButLosing.length === 1 ? 'is' : 'are'} underperforming, sitting below 49% win rate ` +
          `(${joinEnglish(heavilyPlayedButLosing.map(a => `${a.name} at ${pct(a.winRate)}`))}).`
        )
      }
    }
  }

  const topColorPair = (stats?.colorPairs ?? [])
    .filter(cp => cp.colors?.length === 2)
    .sort((a, b) => (b.firstPlayerWinRate ?? 0) - (a.firstPlayerWinRate ?? 0))[0]
  if (topColorPair?.firstPlayerWinRate != null) {
    paragraphs.push(
      `Going first remains a significant edge — ${topColorPair.colors.join('/')} decks win ${pct(topColorPair.firstPlayerWinRate)} of games when they're on the play.`
    )
  }

  let focusMatchups = null
  let focusCards = []
  const focus = focusArchetypeKey ? aggregateArchetypes(stats.profiles).find(a => a.key === focusArchetypeKey) : null
  if (focus) {
    focusMatchups = archetypeMatchupSummary(stats, focusArchetypeKey)
    focusCards = topSignatureCards(stats, focusArchetypeKey, { resolveName: resolveCardName })

    if (focusMatchups && (focusMatchups.best || focusMatchups.worst)) {
      const bits = []
      if (focusMatchups.best) {
        bits.push(`its best matchup is ${focusMatchups.best.name} at ${pct(focusMatchups.best.winRate)} win rate (${focusMatchups.best.games.toLocaleString()} games)`)
      }
      if (focusMatchups.worst && focusMatchups.worst.key !== focusMatchups.best?.key) {
        bits.push(`its toughest is ${focusMatchups.worst.name} at ${pct(focusMatchups.worst.winRate)}`)
      }
      let sentence = `Playing ${focus.name}? ${bits.join('; ')}.`
      if (focusMatchups.mirror) {
        sentence += ` The mirror runs ${pct(focusMatchups.mirror.winRate)}.`
      }
      paragraphs.push(sentence)
    }

    if (focusCards.length > 0) {
      paragraphs.push(
        `Its biggest signature cards are ${joinEnglish(focusCards.map(c => `${c.name} (${pct(c.winRateWith)} win rate when included)`))}.`
      )
    }
  }

  return { paragraphs, topPlayed, topWinRate, underperformers, focusMatchups, focusCards }
}

// Diffs archetype play-rate share between two stats responses over the same
// queue — used both for the rank-band comparison and the week-over-week
// trend, which only differ in which two `/api/stats/meta` calls they diff
// and how the result reads in prose.
function diffArchetypeShares(aStats, bStats, minDelta) {
  const aTotal = aStats?.activity?.totalGames ?? 0
  const bTotal = bStats?.activity?.totalGames ?? 0
  if (!aTotal || !bTotal) return null

  const aMap = new Map(withPlayRate(aggregateArchetypes(aStats.profiles), aTotal).map(x => [x.key, x]))
  const bMap = new Map(withPlayRate(aggregateArchetypes(bStats.profiles), bTotal).map(x => [x.key, x]))

  const deltas = []
  for (const [key, a] of aMap) {
    const bRate = bMap.get(key)?.playRate ?? 0
    deltas.push({ key, name: a.name, aPlayRate: a.playRate, bPlayRate: bRate, delta: a.playRate - bRate })
  }
  for (const [key, b] of bMap) {
    if (!aMap.has(key)) deltas.push({ key, name: b.name, aPlayRate: 0, bPlayRate: b.playRate, delta: -b.playRate })
  }

  return {
    risers: deltas.filter(d => d.delta >= minDelta).sort((x, y) => y.delta - x.delta).slice(0, 3),
    fallers: deltas.filter(d => d.delta <= -minDelta).sort((x, y) => x.delta - y.delta).slice(0, 3),
  }
}

// Compares the same queue/period across two rank bands (e.g. the user's
// selected band vs everyone below it) to surface what shifts with MMR.
// `upperLabel`/`lowerLabel` describe the two bands in the returned paragraph.
export function compareRankBands(upperStats, lowerStats, { upperLabel, lowerLabel, minDelta = 3 } = {}) {
  const diff = diffArchetypeShares(upperStats, lowerStats, minDelta)
  if (!diff) return { risers: [], fallers: [], paragraph: null }
  const { risers, fallers } = diff

  let paragraph = null
  if (risers.length > 0 || fallers.length > 0) {
    const parts = []
    if (risers.length > 0) {
      parts.push(`more common at ${upperLabel} than ${lowerLabel}: ${joinEnglish(risers.map(r => `${r.name} (${pct(r.aPlayRate)} vs ${pct(r.bPlayRate)})`))}`)
    }
    if (fallers.length > 0) {
      parts.push(`more common at ${lowerLabel}: ${joinEnglish(fallers.map(f => `${f.name} (${pct(f.bPlayRate)} vs ${pct(f.aPlayRate)})`))}`)
    }
    paragraph = `The meta shifts with rank — ${parts.join('; ')}.`
  }

  return { risers, fallers, paragraph }
}

// Compares the current period's stats against the immediately preceding
// week's, to surface week-over-week movement — the meta shifts fast, so
// "what's different from last week" is often more useful than a static
// snapshot. `thisLabel`/`lastLabel` describe the two periods in the prose.
export function compareWeeks(thisWeekStats, lastWeekStats, { thisLabel = 'this week', lastLabel = 'last week', minDelta = 3 } = {}) {
  const diff = diffArchetypeShares(thisWeekStats, lastWeekStats, minDelta)
  if (!diff) return { risers: [], fallers: [], paragraph: null }
  const { risers, fallers } = diff

  let paragraph = null
  if (risers.length > 0 || fallers.length > 0) {
    const parts = []
    if (risers.length > 0) {
      parts.push(`gaining ground: ${joinEnglish(risers.map(r => `${r.name} (${pct(r.aPlayRate)}, up from ${pct(r.bPlayRate)})`))}`)
    }
    if (fallers.length > 0) {
      parts.push(`losing ground: ${joinEnglish(fallers.map(f => `${f.name} (${pct(f.aPlayRate)}, down from ${pct(f.bPlayRate)})`))}`)
    }
    paragraph = `From ${lastLabel} to ${thisLabel}, the meta is moving — ${parts.join('; ')}.`
  }

  return { risers, fallers, paragraph }
}

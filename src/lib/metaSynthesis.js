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

// The single build-variant profile (within one aggregated archetype) with
// the largest sample — used as the source for card-lift data, since lift
// isn't meaningfully additive across variants the way games/wins are.
function representativeProfile(stats, archetypeKey) {
  const aggregates = aggregateArchetypes(stats?.profiles)
  const agg = aggregates.find(a => a.key === archetypeKey)
  if (!agg) return null
  const variants = (stats?.profiles ?? []).filter(p => agg.ids.includes(p.id))
  return variants.sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0] ?? null
}

function mapLiftEntry(c, resolveName) {
  return {
    cardId: c.cardId,
    name: resolveName(c.cardId),
    lift: c.lift,
    winRateWith: c.winRateWith,
    presence: c.presence,
  }
}

// The cards most correlated with winning inside one archetype (duels.ink's
// per-card "lift" stat).
export function topSignatureCards(stats, archetypeKey, { limit = 5, resolveName = id => id } = {}) {
  const representative = representativeProfile(stats, archetypeKey)
  return (representative?.cardLift ?? [])
    .filter(c => c.lift > 0)
    .sort((a, b) => b.lift - a.lift)
    .slice(0, limit)
    .map(c => mapLiftEntry(c, resolveName))
}

// The cards most correlated with *losing* inside one archetype — the other
// end of the same duels.ink "lift" stat. Sorted worst (most negative lift)
// first.
export function worstSignatureCards(stats, archetypeKey, { limit = 5, resolveName = id => id } = {}) {
  const representative = representativeProfile(stats, archetypeKey)
  return (representative?.cardLift ?? [])
    .filter(c => c.lift < 0)
    .sort((a, b) => a.lift - b.lift)
    .slice(0, limit)
    .map(c => mapLiftEntry(c, resolveName))
}

function pct(n, digits = 1) {
  return `${n.toFixed(digits)}%`
}

// Item cap for bullet lists in the summary prose — kept short so the
// left-column summary stays scannable. Tables on the right (topPlayed,
// topWinRate, signature/weakest cards) show more (up to 5) independently.
const SUMMARY_LIST_LIMIT = 3

// A synthesis is a sequence of blocks the page renders as either a <p> (type
// 'text') or a labeled bullet list (type 'list', an intro line + items).
// Keeping this structured (rather than pre-joining everything into prose
// strings) is what lets multi-item call-outs — most-played runners-up,
// underperformers, rank/week shifts — render as scannable lists instead of
// a comma-joined wall of text.
function textBlock(text) {
  return { type: 'text', text }
}

function listBlock(intro, items) {
  return { type: 'list', intro, items }
}

// Builds the synthesis blocks shown on MetaSynthesisPage. `context` =
// { queueLabel, periodLabel, bandLabel, focusArchetypeKey, resolveCardName }.
// When `focusArchetypeKey` names a known archetype, extra blocks are
// appended covering its matchup spread and signature cards — otherwise the
// synthesis stays a general meta overview.
export function buildSynthesis(stats, context = {}) {
  const {
    queueLabel = 'this queue',
    periodLabel = 'this period',
    bandLabel = 'all ranks',
    focusArchetypeKey = null,
    resolveCardName = id => id,
  } = context
  const totalGames = stats?.activity?.totalGames ?? 0

  if (!totalGames) {
    return {
      blocks: [textBlock('No games recorded for this queue, period, and rank band yet.')],
      topPlayed: [], topWinRate: [], underperformers: [], focusMatchups: null, focusCards: [], focusWorstCards: [],
    }
  }

  const blocks = []
  const topPlayed = topPlayedArchetypes(stats, { limit: 5 })
  const topWinRate = topWinRateArchetypes(stats, { limit: 5 })
  const underperformers = bottomWinRateArchetypes(stats, { limit: 3 })

  blocks.push(textBlock(
    `${totalGames.toLocaleString()} games played in ${queueLabel} during ${periodLabel} among ${bandLabel}` +
    (stats?.activity?.uniquePlayers ? `, across ${stats.activity.uniquePlayers.toLocaleString()} players.` : '.')
  ))

  if (topPlayed.length > 0) {
    const top = topPlayed[0]
    blocks.push(textBlock(`${top.name} is the most-played archetype at ${pct(top.playRate)} of games, sitting at ${pct(top.winRate)} win rate.`))
    const rest = topPlayed.slice(1, 1 + SUMMARY_LIST_LIMIT)
    if (rest.length > 0) {
      blocks.push(listBlock('Also seeing significant play:', rest.map(a => `${a.name} — ${pct(a.playRate)} play rate, ${pct(a.winRate)} win rate`)))
    }
  }

  if (topWinRate.length > 0) {
    const best = topWinRate[0]
    const isAlsoTopPlayed = topPlayed[0]?.key === best.key
    blocks.push(textBlock(isAlsoTopPlayed
      ? `${best.name} isn't just the most popular deck — it also leads on win rate at ${pct(best.winRate)}.`
      : `${best.name} has the best win rate among established decks at ${pct(best.winRate)}, on ${pct(best.playRate)} play rate.`))
    const others = topWinRate.slice(1, 1 + SUMMARY_LIST_LIMIT).filter(a => a.key !== topPlayed[0]?.key)
    if (others.length > 0) {
      blocks.push(listBlock('Right behind it:', others.map(a => `${a.name} — ${pct(a.winRate)} win rate`)))
    }
  }

  const heavilyPlayedButLosing = underperformers.filter(a => a.playRate >= 3 && a.winRate < 49)
  if (heavilyPlayedButLosing.length > 0) {
    blocks.push(listBlock(
      'Despite meaningful play, these decks are underperforming (below 49% win rate):',
      heavilyPlayedButLosing.map(a => `${a.name} — ${pct(a.winRate)} win rate`)
    ))
  }

  // Require a real sample before calling out a first-player edge — a color
  // pair with only a handful of games can show a misleading 100% swing.
  const reliableColorPairs = (stats?.colorPairs ?? [])
    .filter(cp => cp.colors?.length === 2 && cp.games >= winRateSampleFloor(stats))
  const topColorPair = reliableColorPairs.sort((a, b) => (b.firstPlayerWinRate ?? 0) - (a.firstPlayerWinRate ?? 0))[0]
  if (topColorPair?.firstPlayerWinRate != null) {
    blocks.push(textBlock(
      `Going first remains a significant edge — ${topColorPair.colors.join('/')} decks win ${pct(topColorPair.firstPlayerWinRate)} of games when they're on the play.`
    ))
  }

  let focusMatchups = null
  let focusCards = []
  let focusWorstCards = []
  const focus = focusArchetypeKey ? aggregateArchetypes(stats.profiles).find(a => a.key === focusArchetypeKey) : null
  if (focus) {
    focusMatchups = archetypeMatchupSummary(stats, focusArchetypeKey)
    focusCards = topSignatureCards(stats, focusArchetypeKey, { resolveName: resolveCardName })
    focusWorstCards = worstSignatureCards(stats, focusArchetypeKey, { resolveName: resolveCardName })

    if (focusMatchups && (focusMatchups.best || focusMatchups.worst || focusMatchups.mirror)) {
      const items = []
      if (focusMatchups.best) {
        items.push(`Best matchup — ${focusMatchups.best.name} at ${pct(focusMatchups.best.winRate)} win rate (${focusMatchups.best.games.toLocaleString()} games)`)
      }
      if (focusMatchups.worst && focusMatchups.worst.key !== focusMatchups.best?.key) {
        items.push(`Toughest matchup — ${focusMatchups.worst.name} at ${pct(focusMatchups.worst.winRate)} win rate`)
      }
      if (focusMatchups.mirror) {
        items.push(`Mirror match — ${pct(focusMatchups.mirror.winRate)} win rate`)
      }
      blocks.push(listBlock(`Playing ${focus.name}?`, items))
    }

    // The full 5-card lists (focusCards/focusWorstCards) feed the tables on
    // the right; the summary prose only calls out the top 3 of each.
    if (focusCards.length > 0) {
      blocks.push(listBlock('Its biggest signature cards:', focusCards.slice(0, SUMMARY_LIST_LIMIT).map(c => `${c.name} — ${pct(c.winRateWith)} win rate when included`)))
    }

    if (focusWorstCards.length > 0) {
      blocks.push(listBlock('Its weakest cards (lowest win rate when included):', focusWorstCards.slice(0, SUMMARY_LIST_LIMIT).map(c => `${c.name} — ${pct(c.winRateWith)} win rate when included`)))
    }
  }

  return { blocks, topPlayed, topWinRate, underperformers, focusMatchups, focusCards, focusWorstCards }
}

// Diffs archetype play-rate share between two stats responses over the same
// queue — used both for the rank-band comparison and the week-over-week
// trend, which only differ in which two `/api/stats/meta` calls they diff
// and how the result reads.
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
    risers: deltas.filter(d => d.delta >= minDelta).sort((x, y) => y.delta - x.delta).slice(0, SUMMARY_LIST_LIMIT),
    fallers: deltas.filter(d => d.delta <= -minDelta).sort((x, y) => x.delta - y.delta).slice(0, SUMMARY_LIST_LIMIT),
  }
}

function shareShiftBlocks({ risers, fallers }, { risersIntro, fallersIntro }) {
  const blocks = []
  if (risers.length > 0) {
    blocks.push(listBlock(risersIntro, risers.map(r => `${r.name} — ${pct(r.aPlayRate)} (up from ${pct(r.bPlayRate)})`)))
  }
  if (fallers.length > 0) {
    blocks.push(listBlock(fallersIntro, fallers.map(f => `${f.name} — ${pct(f.aPlayRate)} (down from ${pct(f.bPlayRate)})`)))
  }
  return blocks
}

// Compares the same queue/period across two rank bands (e.g. the user's
// selected band vs everyone below it) to surface what shifts with MMR.
// `upperLabel`/`lowerLabel` describe the two bands in the returned blocks.
export function compareRankBands(upperStats, lowerStats, { upperLabel, lowerLabel, minDelta = 2 } = {}) {
  const diff = diffArchetypeShares(upperStats, lowerStats, minDelta)
  if (!diff) return { risers: [], fallers: [], blocks: [] }
  const { risers, fallers } = diff
  if (risers.length === 0 && fallers.length === 0) return { risers, fallers, blocks: [] }

  const blocks = [
    textBlock('The meta shifts with rank —'),
    ...shareShiftBlocks({ risers, fallers }, {
      risersIntro: `More common at ${upperLabel} than at ${lowerLabel}:`,
      fallersIntro: `More common at ${lowerLabel} than at ${upperLabel}:`,
    }),
  ]

  return { risers, fallers, blocks }
}

// Compares the current period's stats against the immediately preceding
// week's, to surface week-over-week movement — the meta shifts fast, so
// "what's different from last week" is often more useful than a static
// snapshot. `thisLabel`/`lastLabel` describe the two periods in the blocks.
export function compareWeeks(thisWeekStats, lastWeekStats, { thisLabel = 'this week', lastLabel = 'last week', minDelta = 2 } = {}) {
  const diff = diffArchetypeShares(thisWeekStats, lastWeekStats, minDelta)
  if (!diff) return { risers: [], fallers: [], blocks: [] }
  const { risers, fallers } = diff
  if (risers.length === 0 && fallers.length === 0) return { risers, fallers, blocks: [] }

  const blocks = [
    textBlock(`From ${lastLabel} to ${thisLabel}, the meta is moving —`),
    ...shareShiftBlocks({ risers, fallers }, {
      risersIntro: 'Gaining ground:',
      fallersIntro: 'Losing ground:',
    }),
  ]

  return { risers, fallers, blocks }
}

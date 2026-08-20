// Turns a raw /api/stats/meta response (see archetypeStats.js for the shape
// duels.ink returns) into a plain-English synthesis: what's most played,
// what's winning, and how that shifts across rank bands. Pure functions only
// so this stays unit-testable independent of MetaSynthesisPage's fetching/UI.

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
// `context` = { queueLabel, periodLabel, bandLabel }.
export function buildSynthesis(stats, context = {}) {
  const { queueLabel = 'this queue', periodLabel = 'this period', bandLabel = 'all ranks' } = context
  const totalGames = stats?.activity?.totalGames ?? 0
  const paragraphs = []

  if (!totalGames) {
    return { paragraphs: ['No games recorded for this queue, period, and rank band yet.'], topPlayed: [], topWinRate: [], underperformers: [] }
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

  return { paragraphs, topPlayed, topWinRate, underperformers }
}

// Compares the same queue/period across two rank bands (e.g. the user's
// selected band vs everyone below it) to surface what shifts with MMR.
// `upperLabel`/`lowerLabel` describe the two bands in the returned paragraph.
export function compareRankBands(upperStats, lowerStats, { upperLabel, lowerLabel, minDelta = 3 } = {}) {
  const upperTotal = upperStats?.activity?.totalGames ?? 0
  const lowerTotal = lowerStats?.activity?.totalGames ?? 0
  if (!upperTotal || !lowerTotal) return { risers: [], fallers: [], paragraph: null }

  const upper = new Map(withPlayRate(aggregateArchetypes(upperStats.profiles), upperTotal).map(a => [a.key, a]))
  const lower = new Map(withPlayRate(aggregateArchetypes(lowerStats.profiles), lowerTotal).map(a => [a.key, a]))

  const deltas = []
  for (const [key, up] of upper) {
    const down = lower.get(key)
    const lowerPlayRate = down?.playRate ?? 0
    deltas.push({ key, name: up.name, upperPlayRate: up.playRate, lowerPlayRate, delta: up.playRate - lowerPlayRate })
  }
  for (const [key, down] of lower) {
    if (!upper.has(key)) {
      deltas.push({ key, name: down.name, upperPlayRate: 0, lowerPlayRate: down.playRate, delta: -down.playRate })
    }
  }

  const risers = deltas.filter(d => d.delta >= minDelta).sort((a, b) => b.delta - a.delta).slice(0, 3)
  const fallers = deltas.filter(d => d.delta <= -minDelta).sort((a, b) => a.delta - b.delta).slice(0, 3)

  let paragraph = null
  if (risers.length > 0 || fallers.length > 0) {
    const parts = []
    if (risers.length > 0) {
      parts.push(`more common at ${upperLabel} than ${lowerLabel}: ${joinEnglish(risers.map(r => `${r.name} (${pct(r.upperPlayRate)} vs ${pct(r.lowerPlayRate)})`))}`)
    }
    if (fallers.length > 0) {
      parts.push(`more common at ${lowerLabel}: ${joinEnglish(fallers.map(f => `${f.name} (${pct(f.lowerPlayRate)} vs ${pct(f.upperPlayRate)})`))}`)
    }
    paragraph = `The meta shifts with rank — ${parts.join('; ')}.`
  }

  return { risers, fallers, paragraph }
}

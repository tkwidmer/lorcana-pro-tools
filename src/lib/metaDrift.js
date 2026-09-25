// Week-over-week archetype drift for WinrateMatrixPage's Meta Drift section.
// `weeks` is an oldest-first array of duels.ink /api/stats/meta responses for
// the same queue/ranks, one per week. Archetypes are grouped with
// aggregateArchetypes (colors + name), whose `key` is stable across weeks, so
// the same archetype lines up from one week to the next.

import { aggregateArchetypes, archetypeMatchupSummary } from './metaSynthesis'

// Orders rows by their `toIndex` week (the latest complete one) — by games
// or by win rate, descending. Rows absent that week go last.
function sortByWeek(rows, toIndex, sortBy) {
  const value = row => row.cells[toIndex]?.[sortBy] ?? -Infinity
  return rows.sort((a, b) => value(b) - value(a))
}

function deltas(cells, fromIndex, toIndex, fields) {
  const from = cells[fromIndex]
  const to = cells[toIndex]
  return Object.fromEntries(fields.map(f => [`${f}Delta`, from && to ? to[f] - from[f] : null]))
}

// One row per archetype: its games, share of the week's games, and win rate
// in each week (null for a week it didn't appear), plus the change between
// weeks `fromIndex` and `toIndex`, sorted by `sortBy` ('games' | 'winRate')
// in week `toIndex`. Archetypes under `minGames` across all weeks are
// dropped — a handful of games makes the weekly win rate noise.
export function archetypeDrift(weeks, { fromIndex, toIndex, sortBy, minGames = 100 }) {
  const byKey = new Map()
  weeks.forEach((stats, i) => {
    const totalGames = stats.activity.totalGames
    for (const a of aggregateArchetypes(stats.profiles)) {
      if (!byKey.has(a.key)) {
        byKey.set(a.key, { key: a.key, name: a.name, archetypeName: a.archetypeName, colors: a.colors, cells: weeks.map(() => null) })
      }
      byKey.get(a.key).cells[i] = {
        games: a.gamesPlayed,
        share: totalGames > 0 ? (a.gamesPlayed / totalGames) * 100 : 0,
        winRate: a.winRate,
      }
    }
  })

  const rows = [...byKey.values()]
    .map(row => ({
      ...row,
      totalGames: row.cells.reduce((sum, c) => sum + (c?.games ?? 0), 0),
      ...deltas(row.cells, fromIndex, toIndex, ['winRate', 'share']),
    }))
    .filter(row => row.totalGames >= minGames)
  return sortByWeek(rows, toIndex, sortBy)
}

// Drill-in for one archetype: its win rate against each opposing archetype in
// each week. Mirrors are left out (both sides are the same archetype, so the
// rate says nothing about the matchup).
export function archetypeMatchupDrift(weeks, archetypeKey, { fromIndex, toIndex, sortBy, minGames = 30 }) {
  const byKey = new Map()
  weeks.forEach((stats, i) => {
    const aggregates = new Map(aggregateArchetypes(stats.profiles).map(a => [a.key, a]))
    const summary = archetypeMatchupSummary(stats, archetypeKey, { minGames: 1 })
    for (const m of summary?.rows ?? []) {
      if (m.isMirror) continue
      if (!byKey.has(m.key)) {
        const opp = aggregates.get(m.key)
        byKey.set(m.key, { key: m.key, name: opp.name, archetypeName: opp.archetypeName, colors: opp.colors, cells: weeks.map(() => null) })
      }
      byKey.get(m.key).cells[i] = { games: m.games, winRate: m.winRate }
    }
  })

  const rows = [...byKey.values()]
    .map(row => ({
      ...row,
      totalGames: row.cells.reduce((sum, c) => sum + (c?.games ?? 0), 0),
      ...deltas(row.cells, fromIndex, toIndex, ['winRate']),
    }))
    .filter(row => row.totalGames >= minGames)
  return sortByWeek(rows, toIndex, sortBy)
}

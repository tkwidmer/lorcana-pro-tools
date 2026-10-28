import { wilsonInterval, diffInterval } from './practiceSim'
import { matchupKey } from './inkColors'
import { computeDelta } from './decklistDelta'

// Deck versions: each distinct card+count list played under one duels.ink deck.
//
// Lists are compared by card *name*, not card id. duels.ink gives each printing
// its own id (a reprint or a promo like `1-C1-2`), and swapping printings isn't
// a deck change — duels.ink's own personal-stats versions merge those lists
// too. Verified against real match history before this was built; see
// docs/FEATURE_PROPOSALS.md §3.

// The smallest win-rate difference a comparison should be able to detect.
export const DETECTABLE_DIFF = 0.1

// Games each version needs to detect DETECTABLE_DIFF (two-sided 5%, 80% power),
// at the worst-case variance of a 50% win rate: ~393.
export const GAMES_NEEDED = Math.ceil(((1.96 + 0.8416) ** 2 * 2 * 0.25) / DETECTABLE_DIFF ** 2)

export function fromMatchHistoryRow(row) {
  return {
    id: row.game_id,
    deckKey: row.your_deck_id ?? null,
    decklist: row.your_decklist ?? null,
    playedAt: row.started_at,
    won: row.result === 'win' ? true : row.result === 'loss' ? false : null,
    oppColors: matchupKey([row.opp_deck_colors]),
  }
}

function nameCounts(decklist, cardIdToName) {
  const counts = new Map()
  for (const { cardId, count } of decklist) {
    const name = cardIdToName[cardId]
    if (!name) throw new Error(`Unknown card id ${cardId} in a deck list`)
    counts.set(name, (counts.get(name) ?? 0) + count)
  }
  return counts
}

function countsKey(counts) {
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([name, n]) => `${n} ${name}`).join('|')
}

function record(games) {
  const wins = games.filter(g => g.won === true).length
  const losses = games.filter(g => g.won === false).length
  const n = wins + losses
  return { wins, losses, winRate: n ? wins / n : null, interval: n ? wilsonInterval(wins, n) : null }
}

// games: adapter output. Returns { decks, unassigned }:
// - decks: [{ deckKey, games, versions }], most-played first. Each version is
//   { label, cards, games, spans, wins, losses, winRate, interval, changes }:
//   labelled v1…vN by first game played; `spans` holds each run of consecutive
//   games on it (going back to an old list reuses its version); `changes` is
//   the card delta from the previous version (null for v1).
// - unassigned: games with no deck id or no recorded list.
export function buildDeckVersions(games, cardIdToName) {
  const unassigned = []
  const byDeck = new Map()
  for (const g of games) {
    if (!g.deckKey || !g.decklist?.length) { unassigned.push(g); continue }
    if (!byDeck.has(g.deckKey)) byDeck.set(g.deckKey, [])
    byDeck.get(g.deckKey).push(g)
  }

  const decks = [...byDeck].map(([deckKey, deckGames]) => {
    deckGames.sort((a, b) => a.playedAt.localeCompare(b.playedAt))
    const versions = new Map()
    let prev = null
    for (const g of deckGames) {
      const cards = nameCounts(g.decklist, cardIdToName)
      const key = countsKey(cards)
      if (!versions.has(key)) versions.set(key, { label: `v${versions.size + 1}`, cards, games: [], spans: [] })
      const v = versions.get(key)
      v.games.push(g)
      if (v === prev) v.spans.at(-1).to = g.playedAt
      else v.spans.push({ from: g.playedAt, to: g.playedAt })
      prev = v
    }
    const ordered = [...versions.values()]
    return {
      deckKey,
      games: deckGames.length,
      versions: ordered.map((v, i) => ({
        ...v,
        ...record(v.games),
        changes: i === 0 ? null : computeDelta(ordered[i - 1].cards, v.cards),
      })),
    }
  })
  decks.sort((a, b) => b.games - a.games)
  return { decks, unassigned }
}

// Compares two versions from buildDeckVersions(). `verdict` is one of
// 'a-ahead' / 'b-ahead' (the 95% interval for the difference excludes zero),
// 'no-clear-difference' (both have GAMES_NEEDED games and it still doesn't),
// or 'not-enough-games'. `byOppColors` splits both records by opponent colors.
export function compareVersions(a, b) {
  const nA = a.wins + a.losses
  const nB = b.wins + b.losses
  const interval = nA && nB ? diffInterval(a.wins, nA, b.wins, nB) : null
  const verdict = interval && interval[0] > 0 ? 'a-ahead'
    : interval && interval[1] < 0 ? 'b-ahead'
      : Math.min(nA, nB) >= GAMES_NEEDED ? 'no-clear-difference'
        : 'not-enough-games'

  const colors = new Map()
  for (const [side, v] of [['a', a], ['b', b]]) {
    for (const g of v.games) {
      if (g.won == null) continue
      if (!colors.has(g.oppColors)) colors.set(g.oppColors, { oppColors: g.oppColors, a: { wins: 0, losses: 0 }, b: { wins: 0, losses: 0 } })
      colors.get(g.oppColors)[side][g.won ? 'wins' : 'losses']++
    }
  }
  const total = r => r.a.wins + r.a.losses + r.b.wins + r.b.losses
  const byOppColors = [...colors.values()].sort((x, y) => total(y) - total(x))

  return {
    diff: nA && nB ? a.wins / nA - b.wins / nB : null,
    interval,
    verdict,
    gamesNeeded: GAMES_NEEDED,
    byOppColors,
  }
}

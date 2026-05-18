import { matchupKey } from './inkColors'

const PLACEHOLDER_NAMES = new Set(['Player 1', 'Player 2', 'Unknown', ''])

function isRealName(name) {
  return name && !PLACEHOLDER_NAMES.has(name.trim())
}

function getDeckKey(colors) {
  return matchupKey(colors) || 'unknown'
}

function firstPlayerOf(game) {
  const first = (game.log ?? []).find(l => l.turnNumber === 1)
  if (!first) return null
  if (first.player === 1 || first.player === '1') return 1
  if (first.player === 2 || first.player === '2') return 2
  return null
}

function playerTurnsFor(game, side) {
  const total = game.currentTurn ?? 0
  if (total === 0) return 0
  const first = firstPlayerOf(game)
  if (first == null) return Math.ceil(total / 2) // unknown, approximate
  if (first === side) return Math.ceil(total / 2)
  return Math.floor(total / 2)
}

export function listPlayers(records) {
  const players = {}
  for (const r of records) {
    const g = r.game
    for (const side of [1, 2]) {
      const name = side === 1 ? g.p1Name : g.p2Name
      if (!isRealName(name)) continue
      if (!players[name]) {
        players[name] = {
          name,
          games: 0,
          wins: 0,
          losses: 0,
          deckKeys: new Set(),
          lastSeen: 0,
        }
      }
      const p = players[name]
      p.games++
      if (g.winner === side) p.wins++
      else if (g.winner != null) p.losses++
      const colors = side === 1 ? g.p1InkColors : g.p2InkColors
      p.deckKeys.add(getDeckKey(colors))
      if (r.lastUpdated > p.lastSeen) p.lastSeen = r.lastUpdated
    }
  }
  return Object.values(players)
    .map(p => ({
      ...p,
      deckCount: p.deckKeys.size,
      deckKeys: Array.from(p.deckKeys),
      winRate: (p.wins + p.losses) > 0 ? p.wins / (p.wins + p.losses) : null,
    }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
}

export function buildPlayerProfile(records, name) {
  const playerGames = []
  for (const r of records) {
    const g = r.game
    for (const side of [1, 2]) {
      const sideName = side === 1 ? g.p1Name : g.p2Name
      if (sideName !== name) continue
      const colors = side === 1 ? g.p1InkColors : g.p2InkColors
      playerGames.push({ record: r, game: g, side, deckKey: getDeckKey(colors), colors: colors ?? [] })
    }
  }
  if (playerGames.length === 0) return null

  // Bucket by deck (ink color combo)
  const deckBuckets = {}
  for (const pg of playerGames) {
    if (!deckBuckets[pg.deckKey]) {
      deckBuckets[pg.deckKey] = {
        key: pg.deckKey,
        colors: pg.colors,
        games: [],
        cardMaxPlays: {},
        cardMaxInks: {},
        cardSeenInGames: {},
      }
    }
    const bucket = deckBuckets[pg.deckKey]
    bucket.games.push(pg)

    const observed = pg.side === 1 ? pg.game.p1ObservedDeck : pg.game.p2ObservedDeck
    for (const card of (observed ?? [])) {
      const name = card.name
      bucket.cardMaxPlays[name] = Math.max(bucket.cardMaxPlays[name] ?? 0, card.plays ?? 0)
      bucket.cardMaxInks[name] = Math.max(bucket.cardMaxInks[name] ?? 0, card.inked ?? 0)
      bucket.cardSeenInGames[name] = (bucket.cardSeenInGames[name] ?? 0) + 1
    }
  }

  const decks = Object.values(deckBuckets).map(bucket => {
    const games = bucket.games
    const wins = games.filter(g => g.game.winner === g.side).length
    const losses = games.filter(g => g.game.winner != null && g.game.winner !== g.side).length
    const completed = wins + losses

    // Card aggregation: best estimate per card = max(plays + inks) across games
    // because inked copies are usually distinct from played copies
    const names = new Set([
      ...Object.keys(bucket.cardMaxPlays),
      ...Object.keys(bucket.cardMaxInks),
    ])
    const cards = Array.from(names).map(name => {
      const plays = bucket.cardMaxPlays[name] ?? 0
      const inks = bucket.cardMaxInks[name] ?? 0
      const estimatedCopies = Math.min(4, Math.max(plays, inks, 1))
      return {
        name,
        plays,
        inks,
        seenIn: bucket.cardSeenInGames[name] ?? 0,
        estimatedCopies,
      }
    }).sort((a, b) =>
      b.estimatedCopies - a.estimatedCopies ||
      b.plays - a.plays ||
      a.name.localeCompare(b.name)
    )

    const totalSlots = cards.reduce((sum, c) => sum + c.estimatedCopies, 0)

    // Play patterns
    let quests = 0, challenges = 0, inks = 0, turns = 0, lore = 0
    let wentFirst = 0, wentSecond = 0
    for (const pg of games) {
      const myLogs = (pg.game.log ?? []).filter(l =>
        l.player === pg.side || l.player === String(pg.side)
      )
      quests += myLogs.filter(l => l.type === 'QUEST').length
      challenges += myLogs.filter(l => l.type === 'CHALLENGE').length
      inks += myLogs.filter(l => l.type === 'CARD_INKED').length
      turns += playerTurnsFor(pg.game, pg.side)
      lore += pg.side === 1 ? (pg.game.p1Lore ?? 0) : (pg.game.p2Lore ?? 0)
      const first = firstPlayerOf(pg.game)
      if (first === pg.side) wentFirst++
      else if (first != null) wentSecond++
    }

    return {
      key: bucket.key,
      colors: bucket.colors,
      games,
      gameCount: games.length,
      wins,
      losses,
      winRate: completed > 0 ? wins / completed : null,
      cards,
      uniqueCards: cards.length,
      totalSlots,
      questsPerTurn: turns > 0 ? quests / turns : 0,
      challengesPerTurn: turns > 0 ? challenges / turns : 0,
      inkRate: turns > 0 ? inks / turns : 0,
      avgFinalLore: games.length ? lore / games.length : 0,
      avgTurns: games.length ? games.reduce((s, g) => s + (g.game.currentTurn ?? 0), 0) / games.length : 0,
      wentFirst,
      wentSecond,
    }
  }).sort((a, b) => b.gameCount - a.gameCount)

  const overallWins = playerGames.filter(g => g.game.winner === g.side).length
  const overallLosses = playerGames.filter(g => g.game.winner != null && g.game.winner !== g.side).length

  return {
    name,
    games: playerGames,
    gameCount: playerGames.length,
    wins: overallWins,
    losses: overallLosses,
    winRate: (overallWins + overallLosses) > 0 ? overallWins / (overallWins + overallLosses) : null,
    decks,
  }
}

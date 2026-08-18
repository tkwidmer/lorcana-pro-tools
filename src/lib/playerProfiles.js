import { matchupKey } from './inkColors'
import { buildDirectory } from './opponentDirectory'

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

// Per-opponent summary from scouted games only (spectated via the Chrome
// extension or imported as a shared snapshot) — no gamelog data mixed in.
function listScoutedPlayers(records) {
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
  return players
}

// Unified per-opponent list combining scouted games (`scoutedGames.js`, full
// board-state snapshots) and imported duels.ink gamelogs (`gamelogHistory.js`,
// coarser but far more numerous) — the two systems have no way to detect the
// same physical match was captured by both, so overlapping games are simply
// summed rather than deduplicated. `scoutedGameCount`/`gamelogGameCount` are
// broken out so the UI can be transparent about where the numbers came from.
export function listPlayers(records, gamelogs = []) {
  const players = listScoutedPlayers(records)
  const gamelogOpponents = buildDirectory(gamelogs)

  for (const opp of gamelogOpponents) {
    if (!players[opp.name]) {
      players[opp.name] = {
        name: opp.name,
        games: 0,
        wins: 0,
        losses: 0,
        deckKeys: new Set(),
        lastSeen: 0,
      }
    }
    const p = players[opp.name]
    p.scoutedGameCount = p.games
    p.games += opp.gameCount
    // buildDirectory's wins/losses are from *my* perspective (my wins against
    // this opponent) — flip them here so `wins`/`losses` stay consistent with
    // the scouted side's meaning: this named player's own record.
    p.wins += opp.losses
    p.losses += opp.wins
    for (const d of opp.decks) p.deckKeys.add(d.key)
    if (opp.lastPlayed > p.lastSeen) p.lastSeen = opp.lastPlayed
    p.gamelogGameCount = opp.gameCount
  }

  return Object.values(players)
    .map(p => ({
      ...p,
      scoutedGameCount: p.scoutedGameCount ?? p.games,
      gamelogGameCount: p.gamelogGameCount ?? 0,
      deckCount: p.deckKeys.size,
      deckKeys: Array.from(p.deckKeys),
      winRate: (p.wins + p.losses) > 0 ? p.wins / (p.wins + p.losses) : null,
    }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
}

// Deck buckets built from scouted games only — same shape `buildPlayerProfile`
// has always returned. Kept separate so it can be merged with gamelog-derived
// deck data below without disturbing this logic.
function buildScoutedProfile(records, name) {
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

// Merges a scouted-game deck bucket and a gamelog-derived deck bucket (from
// buildDirectory) that share a deckKey. Either side may be absent — a deck
// only ever seen via one source keeps that source's fields and zeroes the
// other's. Card stats are combined by name: scouted `plays`/`inks` (max
// observed in a single game — used for the inferred decklist) sit alongside
// gamelog `played`/`inked`/`discarded`/`destroyed` (summed across games).
function mergeDeckBuckets(scoutedDeck, gamelogDeck) {
  const key = scoutedDeck?.key ?? gamelogDeck?.key
  const colors = scoutedDeck?.colors?.length ? scoutedDeck.colors : (gamelogDeck?.colors ?? [])

  const cardsByName = {}
  for (const c of scoutedDeck?.cards ?? []) {
    cardsByName[c.name] = { name: c.name, plays: c.plays, inks: c.inks, estimatedCopies: c.estimatedCopies, played: 0, inked: 0, discarded: 0, destroyed: 0, seenIn: c.seenIn }
  }
  for (const c of gamelogDeck?.cards ?? []) {
    if (!cardsByName[c.name]) {
      cardsByName[c.name] = {
        name: c.name, plays: 0, inks: 0,
        estimatedCopies: Math.min(4, Math.max(c.played, c.inked, 1)),
        played: 0, inked: 0, discarded: 0, destroyed: 0, seenIn: 0,
      }
    }
    const entry = cardsByName[c.name]
    entry.played += c.played
    entry.inked += c.inked
    entry.discarded += c.discarded
    entry.destroyed += c.destroyed
    entry.seenIn += c.seenIn
  }
  const cards = Object.values(cardsByName).sort((a, b) =>
    b.estimatedCopies - a.estimatedCopies ||
    (b.plays + b.played) - (a.plays + a.played) ||
    a.name.localeCompare(b.name)
  )
  const totalSlots = cards.reduce((sum, c) => sum + c.estimatedCopies, 0)

  const scoutedGameCount = scoutedDeck?.gameCount ?? 0
  const gamelogGameCount = gamelogDeck?.gameCount ?? 0
  const gameCount = scoutedGameCount + gamelogGameCount
  // gamelogDeck's wins/losses are from *my* perspective (buildDirectory) —
  // flip them so this stays "this opponent's own record", matching scouted.
  const wins = (scoutedDeck?.wins ?? 0) + (gamelogDeck?.losses ?? 0)
  const losses = (scoutedDeck?.losses ?? 0) + (gamelogDeck?.wins ?? 0)
  const completed = wins + losses

  return {
    key,
    colors,
    games: scoutedDeck?.games ?? [], // full board-state games, scouted only
    scoutedGameCount,
    gamelogGameCount,
    gameCount,
    wins,
    losses,
    winRate: completed > 0 ? wins / completed : null,
    cards,
    uniqueCards: cards.length,
    totalSlots,
    // Play-pattern stats (quests/turn, ink rate, etc.) require the full
    // per-turn log a gamelog import doesn't carry — scouted-only.
    questsPerTurn: scoutedDeck?.questsPerTurn ?? 0,
    challengesPerTurn: scoutedDeck?.challengesPerTurn ?? 0,
    inkRate: scoutedDeck?.inkRate ?? 0,
    avgFinalLore: scoutedDeck?.avgFinalLore ?? 0,
    avgTurns: scoutedDeck?.avgTurns ?? 0,
    wentFirst: scoutedDeck?.wentFirst ?? 0,
    wentSecond: scoutedDeck?.wentSecond ?? 0,
    hasScoutedData: !!scoutedDeck,
    hasGamelogData: !!gamelogDeck,
  }
}

// Unified opponent profile combining scouted games (full board-state, from
// the Chrome extension or an imported snapshot) and duels.ink gamelog
// imports (coarser per-card totals, no turn-by-turn detail). The two sources
// can't be deduplicated against each other — there's no shared game ID
// between a spectated match and a duels.ink gamelog export — so overlapping
// games are summed rather than merged 1:1. `hasScoutedData`/`hasGamelogData`
// on each deck let the UI show which stats are actually available.
export function buildPlayerProfile(records, gamelogs, name) {
  const scouted = buildScoutedProfile(records, name)
  const gamelogOpp = buildDirectory(gamelogs).find(o => o.name === name) ?? null
  if (!scouted && !gamelogOpp) return null

  const scoutedDecksByKey = {}
  for (const d of scouted?.decks ?? []) scoutedDecksByKey[d.key] = d
  const gamelogDecksByKey = {}
  for (const d of gamelogOpp?.decks ?? []) gamelogDecksByKey[d.key] = d

  const allKeys = new Set([...Object.keys(scoutedDecksByKey), ...Object.keys(gamelogDecksByKey)])
  const decks = Array.from(allKeys)
    .map(key => mergeDeckBuckets(scoutedDecksByKey[key], gamelogDecksByKey[key]))
    .sort((a, b) => b.gameCount - a.gameCount)

  const scoutedGameCount = scouted?.gameCount ?? 0
  const gamelogGameCount = gamelogOpp?.gameCount ?? 0
  const wins = (scouted?.wins ?? 0) + (gamelogOpp?.wins ?? 0)
  const losses = (scouted?.losses ?? 0) + (gamelogOpp?.losses ?? 0)
  const completed = wins + losses

  return {
    name,
    games: scouted?.games ?? [],
    gameCount: scoutedGameCount + gamelogGameCount,
    scoutedGameCount,
    gamelogGameCount,
    wins,
    losses,
    winRate: completed > 0 ? wins / completed : null,
    decks,
  }
}

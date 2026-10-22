// Pure helpers behind the public Tournament Results pages (/results/*):
// derive a player's outcome from an archived match, roll a player's archive
// up into summary stats, and adapt archived bracket rows to the RPH match
// shape EliminationBracket already renders. Server shapes are documented in
// docs/superpowers/specs/2026-10-22-public-tournament-results-design.md.

// The discovery sweep that feeds the archive also picks up 4–8 player "CCQ
// trial" events; the results list hides anything under this by default.
export const MAJOR_MIN_PLAYERS = 32

export function isMajor(event) {
  return (event.startingPlayerCount ?? 0) >= MAJOR_MIN_PLAYERS
}

// A player's view of one archived match. An unreported result (no winner,
// not flagged a draw) counts as a draw, matching the head-to-head endpoint.
export function matchOutcome(match, playerId) {
  if (match.isBye || !match.player2) return { result: 'bye', opponent: null, score: null }
  const opponent = match.player1.id === playerId ? match.player2 : match.player1
  const won = match.winnerId === playerId
  const lost = match.winnerId != null && match.winnerId !== playerId
  const result = match.isDraw || !match.winnerId ? 'draw' : won ? 'win' : lost ? 'loss' : 'draw'
  const w = match.gamesWonByWinner
  const l = match.gamesWonByLoser
  const score = w == null || l == null ? null : result === 'loss' ? `${l}-${w}` : `${w}-${l}`
  return { result, opponent, score }
}

function relationship(order, player) {
  return { player_order: order, player: { id: player.id }, user_event_status: { best_identifier: player.name } }
}

export function toBracketMatch(match) {
  const relationships = [relationship(1, match.player1)]
  if (match.player2) relationships.push(relationship(2, match.player2))
  return {
    round_number: match.roundNumber,
    table_number: match.tableNumber,
    phase_name: match.phaseName,
    status: 'COMPLETE',
    match_is_bye: match.isBye,
    match_is_intentional_draw: match.isDraw,
    match_is_unintentional_draw: false,
    winning_player: match.winnerId,
    player_match_relationships: relationships,
  }
}

const MAX_RIVALS = 10

export function playerSummary({ events, matches, playerId }) {
  const record = { wins: 0, losses: 0, draws: 0 }
  const byOpponent = new Map()
  for (const match of matches) {
    const { result, opponent } = matchOutcome(match, playerId)
    if (result === 'bye') continue
    const key = result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws'
    record[key] += 1
    const r = byOpponent.get(opponent.id) ?? { playerId: opponent.id, playerName: opponent.name, meetings: 0, wins: 0, losses: 0, draws: 0 }
    r.meetings += 1
    r[key] += 1
    if (opponent.name) r.playerName = opponent.name
    byOpponent.set(opponent.id, r)
  }
  const rivals = [...byOpponent.values()]
    .sort((a, b) => b.meetings - a.meetings || b.wins - a.wins)
    .slice(0, MAX_RIVALS)

  let bestFinish = null
  for (const e of events) {
    if (e.rank == null) continue
    const better = !bestFinish || e.rank < bestFinish.rank ||
      (e.rank === bestFinish.rank && (e.startingPlayerCount ?? 0) > (bestFinish.startingPlayerCount ?? 0))
    if (better) bestFinish = { rank: e.rank, eventId: e.eventId, eventName: e.eventName, startingPlayerCount: e.startingPlayerCount ?? null }
  }

  return {
    eventsPlayed: events.length,
    topCuts: events.filter((e) => e.madeTopCut).length,
    bestFinish,
    record,
    rivals,
  }
}

// event_date is a date-only string; parsing it with `new Date(str)` would
// read it as UTC midnight and show the previous day west of Greenwich.
export function formatEventDate(yyyyMmDd) {
  if (!yyyyMmDd) return '—'
  const [y, mo, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
  return `${n}${suffix}`
}

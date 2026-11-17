// Pure helpers behind the public Tournament Results pages (/results/*):
// derive a player's outcome from an archived match, roll a player's archive
// up into summary stats, and adapt archived bracket rows to the RPH match
// shape EliminationBracket already renders. Server shapes are documented in
// docs/superpowers/specs/2026-10-22-public-tournament-results-design.md.
import { cutQualifiers } from './tournamentInks'

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

// An archived event as the RPH shapes Tournament Lookup's ink-pair tabs
// (InkPairStats.jsx) read. The archive keeps each player's pair on their
// standing (from Play Hub's deck descriptors or an inkdecks upload), so it is
// put back on every match as the deck descriptor label. Unranked standings
// are left out; the event has no live round. `stages` are the cuts the import
// recorded (Day 2: played in the second Swiss phase; the top cut), for the
// Conversion tab, each kept only when someone made it. Under a top cut smaller
// than 32 an `optional` Top 32 comes before it, decided like Tournament
// Lookup's: everyone on or above 32nd place's match points. Final ranks below
// the bracket are the last Swiss round's (DLC London: the same 38 players).
export function archiveInkData({ event, standings, matches }) {
  const inksById = new Map(standings.filter((s) => s.inks).map((s) => [String(s.playerId), s.inks]))
  const label = (id) => {
    const inks = inksById.get(String(id))
    return inks ? { parts: [{ value: inks.join(',') }] } : undefined
  }
  const allMatches = matches.map((m) => {
    const match = toBracketMatch(m)
    for (const rel of match.player_match_relationships) rel.user_event_status.deck_descriptor_label = label(rel.player.id)
    return match
  })
  const ranked = standings
    .filter((s) => s.rank != null)
    .map((s) => ({
      rank: s.rank,
      match_points: s.matchPoints,
      match_record: s.record,
      player: { id: s.playerId },
      user_event_status: { best_identifier: s.playerName },
    }))
  const ids = (pick) => new Set(standings.filter(pick).map((s) => String(s.playerId)))
  const topCut = { label: `Top ${event.topCutSize}`, ids: ids((s) => s.madeTopCut) }
  const top32 = topCut.ids.size > 0 && event.topCutSize < 32 && ranked.some((s) => s.rank === 32)
    ? { label: 'Top 32', ids: cutQualifiers(ranked, { type: 'rank', value: 32, ties: true }), optional: true }
    : null
  const stages = [{ label: 'Day 2', ids: ids((s) => s.madeDayTwo) }, top32, topCut].filter((s) => s?.ids.size > 0)
  return {
    inksById,
    allMatches,
    stages,
    standings: ranked,
    structure: {
      eventName: event.eventName,
      gameplayFormat: event.gameplayFormat,
      startingPlayerCount: event.startingPlayerCount,
      topCutSize: event.topCutSize,
      cuts: [],
    },
  }
}

const MAX_RIVALS = 10

// DLCs and Championships played, from each event's RPH template (event_tier).
// RPH also runs some CCQs on the championship template (DLC London's, 1256351).
export function seriesCounts(events) {
  return {
    dlcs: events.filter((e) => e.eventTier === 'challenge').length,
    championships: events.filter((e) => e.eventTier === 'challenge_championship' && !/qualifier/i.test(e.eventName ?? '')).length,
  }
}

export function playerSummary({ events, matches, playerId }) {
  const record = { wins: 0, losses: 0, draws: 0 }
  const byOpponent = new Map()
  // The ink pair each event was played with, and per pair its events, cuts and record.
  const inksByEvent = new Map(events.filter((e) => e.inks).map((e) => [e.eventId, e.inks]))
  const byPair = new Map()
  for (const e of events) {
    if (!e.inks) continue
    const p = byPair.get(e.inks.join('/')) ?? { inks: e.inks, events: 0, topCuts: 0, wins: 0, losses: 0, draws: 0 }
    p.events += 1
    if (e.madeTopCut) p.topCuts += 1
    byPair.set(e.inks.join('/'), p)
  }
  for (const match of matches) {
    const { result, opponent } = matchOutcome(match, playerId)
    if (result === 'bye') continue
    const key = result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws'
    record[key] += 1
    const inks = inksByEvent.get(match.eventId)
    if (inks) byPair.get(inks.join('/'))[key] += 1
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
    ...seriesCounts(events),
    bestFinish,
    record,
    rivals,
    inkPairs: [...byPair.values()].sort((a, b) => b.events - a.events || b.wins - a.wins),
  }
}

// event_date is a date-only string; parsing it with `new Date(str)` would
// read it as UTC midnight and show the previous day west of Greenwich.
export function formatEventDate(yyyyMmDd) {
  if (!yyyyMmDd) return '—'
  const [y, mo, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// "5-2", or "5-2-1" with draws.
export function formatRecord({ wins, losses, draws }) {
  return `${wins}-${losses}${draws ? `-${draws}` : ''}`
}

// A Glicko rating with its deviation, both whole: "1,712 ± 60".
export function formatRating({ rating, rd }) {
  return `${Math.round(rating).toLocaleString('en-US')} ± ${Math.round(rd)}`
}

// The change since a player's previous rated event: "+12", "−8", "0", or
// "—" for a player with one event.
export function ratingDelta(delta) {
  if (delta == null) return '—'
  const n = Math.round(delta)
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}

export function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
  return `${n}${suffix}`
}

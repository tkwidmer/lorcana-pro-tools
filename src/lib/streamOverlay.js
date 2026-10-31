// Pure helpers shared by the Stream Overlay control panel, the OBS view and
// the players' controller. The source of truth is a `stream_tables` row
// (supabase/migrations/012_stream_tables.sql — one column per overlay
// field); these turn a row into the render shape and panel actions into
// column patches. Data access lives in streamTables.js.

import { resolveColors } from './inkColors'
import { bracketRoundLabel } from './bracket'
import { resolveInkName } from './inkColors'
import { ordinal } from './resultsArchive'

export const OVERLAY_WIDTH = 1920
export const OVERLAY_HEIGHT = 1080

export const MAX_GAME_WINS = 2

// A game of Lorcana is won at 20 lore: the view pulses the number there as a
// cue to tap the game win (never automatic — a mis-tap shouldn't flip the
// screen to Winner).
export const WINNING_LORE = 20

// The size class for a name in a fixed-width slot: the largest of `sizes`
// (ordered big → small) whose character budget the name fits, so a long RPH
// name shrinks instead of truncating. Budgets are per slot, measured for
// Oswald caps at that slot's width.
export function nameSizeClass(name, sizes) {
  return (sizes.find(([, maxChars]) => name.length <= maxChars) ?? sizes[sizes.length - 1])[0]
}

// How long a featured card stays on stream in the 'fade' mode, and the fade
// out at the end of it.
export const FEATURED_SECONDS = 15
export const FEATURED_FADE_MS = 500

// Where a side's featured card is: 'hidden', 'shown', or 'fading' over its
// last FEATURED_FADE_MS. `mode` is the row's featured_cards ('off' / 'fade' /
// 'stay'); `featuredAt` is when it was picked (ms since epoch). Both the view
// and the panel's picker read it, so the tile's highlight matches the stream.
export function featuredPhase(mode, name, featuredAt, now) {
  if (mode === 'off' || !name) return 'hidden'
  if (mode === 'stay') return 'shown'
  const left = featuredAt + FEATURED_SECONDS * 1000 - now
  if (!(left > 0)) return 'hidden'
  return left <= FEATURED_FADE_MS ? 'fading' : 'shown'
}

// Card image aspect (LorcanaJSON thumbnails are 367×512).
export const CARD_ASPECT = 512 / 367

// The largest card width (whole pixels) that fits `n` cards into a
// width × height box with `gap` between them, over every column count.
export function deckCardWidth(n, width, height, gap) {
  let best = 0
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const byWidth = (width - (cols - 1) * gap) / cols
    const byHeight = (height - (rows - 1) * gap) / rows / CARD_ASPECT
    best = Math.max(best, Math.min(byWidth, byHeight))
  }
  return Math.floor(best)
}

// The site's own look: ink black fill, forge gold accent (src/index.css).
export const DEFAULT_THEME = { fill: '#17171a', accent: '#b5832a' }

// Text on the fill: the site's paper white on a dark fill, ink on a light
// one, by WCAG relative luminance so an organizer's pale theme still reads.
// A deck's inks from its matched entries (matchDeckList): every ink that
// appears, most copies first, so a splash still shows and the main ink
// leads. Dual-ink cards count for both.
export function deckInks(entries) {
  const copies = new Map()
  for (const { card, count } of entries) {
    for (const ink of resolveColors(card.colors?.length ? card.colors : [card.color])) {
      copies.set(ink, (copies.get(ink) ?? 0) + count)
    }
  }
  return [...copies].sort((a, b) => b[1] - a[1]).map(([ink]) => ink)
}

export function themeTextColor(fillHex) {
  const channel = h => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [1, 3, 5].map(i => channel(fillHex.slice(i, i + 2)))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.4 ? '#17171a' : '#f2f1ee'
}

// A row (from get_stream_table / the owner's select / a broadcast payload)
// → what the pages render.
export function rowToState(row) {
  return {
    mode: row.mode,
    theme: { fill: row.theme_fill, accent: row.theme_accent, text: themeTextColor(row.theme_fill) },
    eventName: row.event_name,
    eventLogoUrl: row.event_logo_url,
    sponsorLogoUrl: row.sponsor_logo_url,
    sponsor2LogoUrl: row.sponsor2_logo_url,
    round: row.round,
    note: row.note,
    // 0 = no deck over the gameplay cam, else the side (1 or 2) being shown.
    deckShown: row.deck_shown,
    // The archive card for the pair (buildPlayerCard), or null; and whether
    // the live view is showing it over the cam.
    playerCard: row.player_card,
    cardShown: row.card_shown,
    // Break-screen content sent from Tournament Lookup (buildStandingsSnapshot /
    // buildBracketSnapshot), and which of them the break screen shows: '' is
    // the pairing, else 'standings' or 'bracket'.
    standings: row.standings,
    bracket: row.bracket,
    // The linked event's active-round results (buildResultsSnapshot), for
    // the caster notes.
    results: row.results,
    breakPanel: row.break_panel,
    // The tournament's metagame as typed in the panel (metaSlices() turns it
    // into the chart), the field size the "Other" fold reads, and whether the
    // live view is showing the pie over the cam.
    metaText: row.meta_text,
    metaPlayers: row.meta_players,
    metaShown: row.meta_shown,
    // Lore as a climbing START→WIN track beside each column instead of the
    // big number at the bottom of it.
    loreTrack: row.lore_track,
    // 'off' / 'fade' / 'stay': whether each side's featured card shows, and
    // whether it fades out after FEATURED_SECONDS.
    featuredCards: row.featured_cards,
    // Wall-time target while running (ms since epoch), null while paused.
    timerEndsAt: row.timer_ends_at ? Date.parse(row.timer_ends_at) : null,
    timerRemainingMs: row.timer_remaining_ms,
    rphEventId: row.rph_event_id,
    players: [1, 2].map(n => ({
      name: row[`p${n}_name`],
      record: row[`p${n}_record`],
      inks: row[`p${n}_inks`],
      lore: row[`p${n}_lore`],
      gameWins: row[`p${n}_game_wins`],
      decklist: row[`p${n}_decklist`],
      // The featured card's name as written in the decklist ('' for none) and
      // when it was picked (ms since epoch, null when never).
      featured: row[`p${n}_featured`],
      featuredAt: row[`p${n}_featured_at`] ? Date.parse(row[`p${n}_featured_at`]) : null,
    })),
  }
}

// The side (0 or 1) that has taken the match, or null while it's still on.
// Derived from game wins alone, so resetting them for the next match clears it.
export function winnerIndex(players) {
  const i = players.findIndex(p => p.gameWins >= MAX_GAME_WINS)
  return i === -1 ? null : i
}

// What the break screen is showing. The table holds the pair that just
// played until the next pairing is published on RPH and sent over, so the
// headline comes from the score: a decided match reads as the result, a fresh
// pairing as the next match, anything else as a match paused between games.
export function breakHeadline(players) {
  const winner = winnerIndex(players)
  const score = `${players[0].gameWins}-${players[1].gameWins}`
  if (winner !== null) return { label: 'Final', score, winner }
  if (players.every(p => p.gameWins === 0)) return { label: 'Next match', score: null, winner: null }
  return { label: 'Match in progress', score, winner: null }
}

export function timerRemainingMs(state, now = Date.now()) {
  if (state.timerEndsAt === null) return state.timerRemainingMs
  return Math.max(0, state.timerEndsAt - now)
}

// Timer actions return the two timer columns to write.
export function startTimer(state, now = Date.now()) {
  if (state.timerEndsAt !== null) return null
  return timerPatch({ timerEndsAt: now + state.timerRemainingMs, timerRemainingMs: state.timerRemainingMs })
}

export function pauseTimer(state, now = Date.now()) {
  if (state.timerEndsAt === null) return null
  return timerPatch({ timerEndsAt: null, timerRemainingMs: timerRemainingMs(state, now) })
}

export function resetTimer(minutes) {
  return timerPatch({ timerEndsAt: null, timerRemainingMs: Math.max(0, minutes) * 60 * 1000 })
}

export function timerPatch({ timerEndsAt, timerRemainingMs }) {
  return {
    timer_ends_at: timerEndsAt === null ? null : new Date(timerEndsAt).toISOString(),
    timer_remaining_ms: timerRemainingMs,
  }
}

// m:ss under an hour, h:mm:ss at or over it — matches the clocks on tournament streams.
export function formatClock(ms) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

// RPH's round clock as the event exposes it: `timer_end_datetime` with
// `timer_is_running`, and when paused, `timer_paused_at_datetime` (end minus
// paused-at is what's left). Returns the overlay's timer fields, or null when
// the event has no clock set.
export function timerFromRph({ timerEndDatetime, timerIsRunning, timerPausedAtDatetime }) {
  if (!timerEndDatetime) return null
  const endsAt = Date.parse(timerEndDatetime)
  if (timerIsRunning) return { timerEndsAt: endsAt, timerRemainingMs: 0 }
  if (!timerPausedAtDatetime) return null
  return { timerEndsAt: null, timerRemainingMs: Math.max(0, endsAt - Date.parse(timerPausedAtDatetime)) }
}

// One poll of a linked RPH clock → the timer columns, or null for no change.
export function rphClockPatch(structure) {
  const timer = timerFromRph(structure)
  return timer ? timerPatch(timer) : null
}

// The round as the overlay captions it: the elimination phase's name in top
// cut, else "Round N".
export function roundLabel(structure) {
  return structure.isElimination && structure.eliminationPhaseName ? structure.eliminationPhaseName : `Round ${structure.currentRoundNumber}`
}

// The active round (the latest that has started, standings or not) as the
// overlay captions it — what a pairing picked from it is sent with.
export function activeRoundLabel(structure) {
  return structure.activePhaseType === 'RANKED_SINGLE_ELIMINATION' ? structure.activePhaseName : `Round ${structure.activeRoundNumber}`
}

// The active round's pairings as the panel's picker lists them, from the
// round's matches and the latest standings: table order, both players with
// their id, name and current record. Byes are left out — a bye is no
// feature match.
export function currentRoundPairings(matches, standings) {
  const recordOf = id => standings.find(e => String(e.player.id) === String(id))?.record ?? ''
  const side = p => ({ id: p.player.id, name: p.user_event_status?.best_identifier ?? p.player.best_identifier ?? '', record: recordOf(p.player.id) })
  return matches
    .filter(m => !m.match_is_bye && (m.player_match_relationships ?? []).length === 2)
    .sort((a, b) => (a.table_number ?? 0) - (b.table_number ?? 0))
    .map(m => {
      const [p1, p2] = [...m.player_match_relationships].sort((a, b) => a.player_order - b.player_order)
      return { id: m.id, table: m.table_number ?? null, players: [side(p1), side(p2)] }
    })
}

// A feature match picked in the panel: names, records, the round
// clock and the event link come from RPH; lore, game wins and decklists
// start fresh (the old pair's lists would be wrong) and no deck is shown;
// inks are left alone (RPH doesn't know decks).
export function featureMatchPatch({ eventName, round, players, timer, rphEventId, playerCard = null }) {
  return {
    ...(timer ? timerPatch(timer) : {}),
    rph_event_id: rphEventId,
    player_card: playerCard,
    card_shown: false,
    event_name: eventName,
    round,
    p1_name: players[0].name, p1_record: players[0].record, p1_lore: 0, p1_game_wins: 0, p1_decklist: '', p1_featured: '', p1_featured_at: null,
    p2_name: players[1].name, p2_record: players[1].record, p2_lore: 0, p2_game_wins: 0, p2_decklist: '', p2_featured: '', p2_featured_at: null,
    deck_shown: 0,
  }
}

const SIDE_FIELDS = ['name', 'record', 'inks', 'lore', 'game_wins', 'decklist', 'featured', 'featured_at']

// "Clear table" between matches: both players, their decklists and featured
// cards, the player card, the break-screen snapshots and anything shown over the cam. The
// event name, logos, theme, timer, linked RPH event, round and note stay —
// they're the operator's setup for the event, not the pairing's.
export function clearTablePatch() {
  const patch = { mode: 'live', deck_shown: 0, card_shown: false, meta_shown: false, player_card: null, standings: null, bracket: null, break_panel: '' }
  for (const n of [1, 2]) {
    Object.assign(patch, { [`p${n}_name`]: '', [`p${n}_record`]: '', [`p${n}_inks`]: [], [`p${n}_lore`]: 0, [`p${n}_game_wins`]: 0, [`p${n}_decklist`]: '', [`p${n}_featured`]: '', [`p${n}_featured_at`]: null })
  }
  return patch
}

// The player card is per side too: its halves and the head-to-head record
// mirror with the players.
function swapPlayerCard(card) {
  if (!card) return card
  return {
    players: [card.players[1], card.players[0]],
    headToHead: {
      wins: [card.headToHead.wins[1], card.headToHead.wins[0]],
      draws: card.headToHead.draws,
      matches: card.headToHead.matches.map(m => ({ ...m, winner: m.winner === null ? null : 1 - m.winner })),
    },
  }
}

// RPH event names as a stream caption: the long official forms become the
// names players use. Leaves anything else alone.
export function shortEventName(name) {
  return (name ?? '')
    .replace(/Disney Lorcana(?: TCG)? Challenge/i, 'DLC')
    .replace(/Challenge Championship Qualifier/i, 'CCQ')
    .replace(/\s*\((CCQ)\)/i, '')
    .replace(/\s*[-:–]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// How much of the standings the break screen shows; the caster notes show
// the whole snapshot.
export const STANDINGS_ROWS = 16

// The standings as the notes and the break screen show them, from the
// round's standings and the event structure: every ranked player.
export function buildStandingsSnapshot(allStandings, structure) {
  const round = roundLabel(structure)
  const rows = [...allStandings]
    .filter(e => e.rank != null)
    .sort((a, b) => a.rank - b.rank)
    .map(e => ({ rank: e.rank, name: e.user_event_status?.best_identifier ?? e.player?.best_identifier ?? '', record: e.record ?? '', points: e.match_points ?? null }))
  return { round, players: allStandings.length, rows }
}

// One RPH match as a snapshot row: both names (p2 null on a bye), the
// winner as a side index, and the game score once reported.
function matchSummary(m) {
  const [p1, p2] = [...(m.player_match_relationships ?? [])].sort((a, b) => a.player_order - b.player_order)
  const name = p => p?.user_event_status?.best_identifier ?? p?.player?.best_identifier ?? null
  const winner = m.winning_player == null ? null : m.winning_player === p1?.player?.id ? 0 : m.winning_player === p2?.player?.id ? 1 : null
  return {
    p1: name(p1), p2: m.match_is_bye ? null : name(p2),
    winner, bye: Boolean(m.match_is_bye),
    score: m.games_won_by_winner != null ? `${m.games_won_by_winner}-${m.games_won_by_loser ?? 0}` : null,
  }
}

// The active round's results as the caster notes list them, from the
// round's matches: every table in order, each with its pairing, whether
// it's finished, and the result so far. The panel's RPH poll rewrites it
// whenever it changes.
export function buildResultsSnapshot(matches, structure) {
  const rows = [...matches]
    .sort((a, b) => (a.table_number ?? 0) - (b.table_number ?? 0))
    .map(m => {
      const done = m.status === 'COMPLETE'
      // Play Hub's updated_at moves when the match is reported.
      return { table: m.table_number ?? null, done, reportedAt: done ? m.updated_at : null, ...matchSummary(m) }
    })
  return { round: activeRoundLabel(structure), matches: rows }
}

// The round's most recently reported result for the view's ticker, or null.
// Byes aren't results anyone reported.
export function latestResult(results) {
  const reported = (results?.matches ?? []).filter(m => m.done && !m.bye && m.reportedAt)
  return reported.reduce((a, b) => (Date.parse(b.reportedAt) > Date.parse(a.reportedAt) ? b : a), reported[0] ?? null)
}

// One result as the ticker reads it: two names around a verb the view
// styles apart from them, then the game score.
export function resultLine(m) {
  if (m.winner === null) return { first: m.p1, verb: 'drew with', second: m.p2, score: null }
  const [first, second] = m.winner === 0 ? [m.p1, m.p2] : [m.p2, m.p1]
  return { first, verb: 'beat', second, score: m.score }
}

// The top cut as the break screen shows it, from the event's matches: the elimination phase's rounds in order, each match's two names,
// the winner as a side index, and the game score. Table order is bracket
// order, as in EliminationBracket.
export function buildBracketSnapshot(allMatches, phaseName) {
  const inPhase = (allMatches ?? []).filter(m => m.phase_name === phaseName)
  const roundNumbers = [...new Set(inPhase.map(m => m.round_number))].sort((a, b) => a - b)
  const rounds = roundNumbers.map(roundNum => {
    const matches = inPhase
      .filter(m => m.round_number === roundNum)
      .sort((a, b) => (a.table_number ?? 0) - (b.table_number ?? 0))
      .map(matchSummary)
    return { label: bracketRoundLabel(matches.length, roundNum, phaseName), matches }
  })
  return { phase: phaseName, rounds }
}

export const PLAYER_CARD_FINISHES = 8
export const PLAYER_CARD_MEETINGS = 5

// The pair's archive history as the view renders it, from the two
// player-history responses and the head-to-head response that Tournament
// Lookup's pairing panel already holds. Finishes: every top cut and Day 2
// first (best rank first within each), then the rest by rank, capped at
// what the card fits. Meetings: newest first, winner as a side index.
// Rating: the whole Glicko rating, and the archive rank (null while provisional).
export function buildPlayerCard({ histories, headToHead, playerIds }) {
  const tier = e => (e.madeTopCut ? 0 : e.madeDayTwo ? 1 : 2)
  const players = histories.map(h => ({
    rating: h.rating ? Math.round(h.rating.rating) : null,
    rank: h.rating?.rank ?? null,
    majorsPlayed: h.majorsPlayed,
    topCutCount: h.topCutCount,
    dayTwoCount: h.dayTwoCount ?? 0,
    finishes: [...h.events]
      .filter(e => e.rank != null)
      .sort((a, b) => tier(a) - tier(b) || a.rank - b.rank || Date.parse(b.eventDate ?? 0) - Date.parse(a.eventDate ?? 0))
      .slice(0, PLAYER_CARD_FINISHES)
      .map(e => ({
        event: shortEventName(e.eventName), year: e.eventDate ? new Date(e.eventDate).getUTCFullYear() : null,
        rank: e.rank, players: e.startingPlayerCount, topCutSize: e.topCutSize,
        tier: ['cut', 'day2', null][tier(e)],
        side: Boolean(e.sideEvent),
      })),
  }))
  const matches = [...headToHead.matches]
    .filter(m => !m.isBye)
    .sort((a, b) => Date.parse(b.eventDate ?? 0) - Date.parse(a.eventDate ?? 0) || b.roundNumber - a.roundNumber)
    .slice(0, PLAYER_CARD_MEETINGS)
    .map(m => ({
      event: shortEventName(m.eventName), year: m.eventDate ? new Date(m.eventDate).getUTCFullYear() : null,
      phase: m.phaseName && !/swiss|phase 1/i.test(m.phaseName) ? m.phaseName : `Round ${m.roundNumber}`,
      winner: m.isDraw || !m.winnerId ? null : m.winnerId === playerIds[0] ? 0 : m.winnerId === playerIds[1] ? 1 : null,
      score: m.gamesWonByWinner != null ? `${m.gamesWonByWinner}-${m.gamesWonByLoser ?? 0}` : null,
    }))
  const wins = [0, 0]
  let draws = 0
  for (const m of headToHead.matches) {
    if (m.isBye) continue
    if (m.isDraw || !m.winnerId) draws += 1
    else if (m.winnerId === playerIds[0]) wins[0] += 1
    else if (m.winnerId === playerIds[1]) wins[1] += 1
  }
  return { players, headToHead: { wins, draws, matches } }
}

// Plain-English lines a caster can read off for one side of the player
// card: the majors record, the rating once ranked, the best finish, and the head-to-head. Built
// from the card's own data, so the notes page needs nothing the OBS view
// doesn't have.
export function casterPoints(card, side, names) {
  const p = card.players[side]
  const other = 1 - side
  const lines = []
  if (p.majorsPlayed === 0) lines.push('No majors in the archive')
  else {
    const parts = [`${p.majorsPlayed} major${p.majorsPlayed === 1 ? '' : 's'} played`]
    if (p.topCutCount) parts.push(`${p.topCutCount} top cut${p.topCutCount === 1 ? '' : 's'}`)
    if (p.dayTwoCount) parts.push(`${p.dayTwoCount} Day 2${p.dayTwoCount === 1 ? '' : 's'}`)
    lines.push(parts.join(', '))
  }
  if (p.rank) lines.push(`Rated ${p.rating.toLocaleString('en-US')}, ranked ${ordinal(p.rank)} in the archive`)
  const best = p.finishes[0]
  if (best) {
    const tag = best.tier === 'cut' ? ` (top ${best.topCutSize})` : best.tier === 'day2' ? ' (Day 2)' : ''
    lines.push(`Best finish: ${ordinal(best.rank)} of ${best.players} at ${best.event}${best.year ? ` ${best.year}` : ''}${tag}${best.side ? ', a side event' : ''}`)
  }
  const { wins, draws, matches } = card.headToHead
  if (wins[0] + wins[1] + draws === 0) lines.push(`First meeting with ${names[other]} in the archive`)
  else {
    const record = `${wins[side]}-${wins[other]}${draws ? `-${draws}` : ''}`
    const stance = wins[side] > wins[other] ? 'Leads' : wins[side] < wins[other] ? 'Trails' : 'Level in'
    const last = matches[0]
    const lastLine = last ? `; last met ${last.event}${last.year ? ` ${last.year}` : ''} ${last.phase}, ${last.winner === null ? 'a draw' : `${names[last.winner]} won${last.score ? ` ${last.score}` : ''}`}` : ''
    lines.push(`${stance} the head-to-head with ${names[other]} ${record}${lastLine}`)
  }
  return lines
}

// Mirrors which side each player sits on; a shown deck follows its player.
export function swapSidesPatch(row) {
  const patch = { deck_shown: [0, 2, 1][row.deck_shown], player_card: swapPlayerCard(row.player_card) }
  for (const f of SIDE_FIELDS) {
    patch[`p1_${f}`] = row[`p2_${f}`]
    patch[`p2_${f}`] = row[`p1_${f}`]
  }
  return patch
}

// The metagame as typed in the panel: one archetype per line, "<name> <n>"
// for a deck count or "<name> <n>%" for a share. Lines without a trailing
// number are ignored. `percent` is true when any line carries a %.
export function parseMeta(text) {
  const entries = []
  let percent = false
  for (const line of (text ?? '').split('\n')) {
    const m = line.trim().match(/^(.*?)[\s:–-]*(\d+(?:\.\d+)?)\s*(%)?$/)
    if (!m || !m[1].trim()) continue
    if (m[3]) percent = true
    entries.push({ name: m[1].trim(), value: Number(m[2]) })
  }
  return { entries, percent }
}

export const META_OTHER_MIN_PLAYERS = 50
export const META_OTHER_MAX_SHARE = 0.05
const OTHER = 'Other'

// The inks an archetype name starts with ("Emerald/Steel Midrange" → emerald,
// steel), for the slice's colors; none when the name doesn't start with one.
export function metaInks(name) {
  const inks = []
  for (const word of name.split(/\s+/)) {
    const parts = word.split('/').map(resolveInkName)
    if (parts.some(p => !p)) break
    inks.push(...parts)
  }
  return [...new Set(inks)]
}

const cap = w => w[0].toUpperCase() + w.slice(1)

// The chart: each ink pair's share of the field, largest first. Lines are
// grouped by the inks their name starts with (so Field Breakdown's archetype
// lines merge into their pairs); a line with no ink in front counts as
// Other. Counts share by their sum; percentages by 100, any remainder being
// Other. In a room over META_OTHER_MIN_PLAYERS players (the typed field
// size, else the sum of the counts) pairs under META_OTHER_MAX_SHARE fold
// into Other, which always sits last.
export function metaSlices(text, players) {
  const { entries, percent } = parseMeta(text)
  if (entries.length === 0) return null
  const sum = entries.reduce((s, e) => s + e.value, 0)
  const total = percent ? Math.max(100, sum) : sum
  const fieldSize = players ?? (percent ? null : sum)
  const fold = (fieldSize ?? 0) > META_OTHER_MIN_PLAYERS
  const byPair = new Map()
  let otherValue = 0
  for (const e of entries) {
    const inks = metaInks(e.name)
    if (inks.length === 0) { otherValue += e.value; continue }
    const key = [...inks].sort().join('/')
    const pair = byPair.get(key) ?? { name: inks.map(cap).join(' / '), inks, value: 0 }
    pair.value += e.value
    byPair.set(key, pair)
  }
  const named = []
  for (const pair of byPair.values()) {
    const share = pair.value / total
    if (fold && share < META_OTHER_MAX_SHARE) otherValue += pair.value
    else named.push({ name: pair.name, count: percent ? null : pair.value, share, inks: pair.inks })
  }
  named.sort((a, b) => b.share - a.share)
  const otherShare = otherValue / total + (percent && sum < 100 ? (100 - sum) / 100 : 0)
  if (otherShare > 0) named.push({ name: OTHER, count: percent ? null : otherValue, share: otherShare, inks: [] })
  return { players: fieldSize, slices: named }
}

// Operator hotkeys on the control panel (and so a Stream Deck sending keys):
// left-hand keys for the left player, right-hand keys for the right player,
// B flips Live / Break, X takes both featured cards off. Letters only, so any
// key sender can produce them.
export const HOTKEYS = {
  q: { side: 1, field: 'lore', delta: 1 }, a: { side: 1, field: 'lore', delta: -1 },
  w: { side: 1, field: 'game_wins', delta: 1 }, s: { side: 1, field: 'game_wins', delta: -1 },
  i: { side: 2, field: 'lore', delta: 1 }, k: { side: 2, field: 'lore', delta: -1 },
  o: { side: 2, field: 'game_wins', delta: 1 }, l: { side: 2, field: 'game_wins', delta: -1 },
  b: { toggleMode: true },
  1: { toggleDeck: 1 }, 2: { toggleDeck: 2 },
  3: { toggleCard: true },
  4: { toggleMeta: true },
  n: { nextGame: true },
  x: { clearFeatured: true },
}

// Takes both sides' featured cards off (the X hotkey).
export const CLEAR_FEATURED_PATCH = { p1_featured: '', p1_featured_at: null, p2_featured: '', p2_featured_at: null }

// The action for a keydown, or null: a plain key with no modifier, and never
// while the operator is typing in a field.
export function hotkeyAction(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return null
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return null
  return HOTKEYS[e.key.toLowerCase()] ?? null
}

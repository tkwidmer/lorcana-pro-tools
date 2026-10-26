import { getSupabaseServiceClient } from './discordSupabase.js'
import { rateEvents, ESTABLISHED_RD, type RatedEvent } from './glicko.js'

// Service-role query/upsert helpers for the tournament_history_* tables
// (supabase/migrations/008_tournament_history.sql). All access goes through
// here — those tables have zero RLS policies, so this service-role client is
// the only way in or out.

export interface EventUpsertInput {
  rphEventId: string
  eventName: string
  eventUrl: string
  storeName: string | null
  gameplayFormat: string | null
  topCutSize: number | null
  totalSwissRounds: number
  hasElimination: boolean
  startingPlayerCount: number | null
  eventDate: string | null
  rawEventDetails: unknown
  importedBy: string
  eventConfigurationTemplate: string | null
  eventTier: string | null
}

export async function upsertEvent(input: EventUpsertInput): Promise<string> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_events')
    .upsert(
      {
        rph_event_id: input.rphEventId,
        event_name: input.eventName,
        event_url: input.eventUrl,
        store_name: input.storeName,
        gameplay_format: input.gameplayFormat,
        top_cut_size: input.topCutSize,
        total_swiss_rounds: input.totalSwissRounds,
        has_elimination: input.hasElimination,
        starting_player_count: input.startingPlayerCount,
        event_date: input.eventDate,
        raw_event_details: input.rawEventDetails,
        imported_by: input.importedBy,
        event_configuration_template: input.eventConfigurationTemplate,
        event_tier: input.eventTier,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'rph_event_id' }
    )
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export interface StandingRow {
  rphPlayerId: string
  playerName: string
  rank: number | null
  matchPoints: number | null
  record: string | null
  madeTopCut: boolean
  madeDayTwo: boolean
}

export async function upsertStandings(eventId: string, rows: StandingRow[]): Promise<number> {
  if (rows.length === 0) return 0
  const supabase = getSupabaseServiceClient()
  const { error } = await supabase.from('tournament_history_standings').upsert(
    rows.map((r) => ({
      event_id: eventId,
      rph_player_id: r.rphPlayerId,
      player_name: r.playerName,
      rank: r.rank,
      match_points: r.matchPoints,
      record: r.record,
      made_top_cut: r.madeTopCut,
      made_day_two: r.madeDayTwo,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'event_id,rph_player_id' }
  )
  if (error) throw error
  return rows.length
}

export interface MatchRow {
  rphMatchId: string
  roundNumber: number
  phaseName: string | null
  tableNumber: number | null
  player1Id: string
  player1Name: string | null
  player2Id: string | null
  player2Name: string | null
  winnerId: string | null
  isBye: boolean
  isDraw: boolean
  gamesWonByWinner: number | null
  gamesWonByLoser: number | null
}

export async function upsertMatches(eventId: string, rows: MatchRow[]): Promise<number> {
  if (rows.length === 0) return 0
  const supabase = getSupabaseServiceClient()
  const { error } = await supabase.from('tournament_history_matches').upsert(
    rows.map((r) => ({
      event_id: eventId,
      rph_match_id: r.rphMatchId,
      round_number: r.roundNumber,
      phase_name: r.phaseName,
      table_number: r.tableNumber,
      player1_id: r.player1Id,
      player1_name: r.player1Name,
      player2_id: r.player2Id,
      player2_name: r.player2Name,
      winner_id: r.winnerId,
      is_bye: r.isBye,
      is_draw: r.isDraw,
      games_won_by_winner: r.gamesWonByWinner,
      games_won_by_loser: r.gamesWonByLoser,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'event_id,rph_match_id' }
  )
  if (error) throw error
  return rows.length
}

// Ordering by a column on an embedded/joined table needs PostgREST's
// `foreignTable` option rather than a dotted path in `.order()`, and that
// option keys off the actual relation name, not a `select()` alias — so we
// sort client-side instead. Result sets here are one player's or one
// pairing's history, small enough that this is simpler than fighting
// PostgREST's embedded-order edge cases (including nulls from an event
// missing a date).
function eventDateOf(row: any): number {
  const d = row.event?.event_date
  return d ? new Date(d).getTime() : 0
}

export async function getPlayerHistory(rphPlayerId: string) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_standings')
    .select(
      'player_name, rank, match_points, record, made_top_cut, made_day_two, event:tournament_history_events(rph_event_id, event_name, event_date, store_name, top_cut_size, starting_player_count, gameplay_format, event_tier, event_url)'
    )
    .eq('rph_player_id', rphPlayerId)

  if (error) throw error
  return (data ?? []).sort((a, b) => eventDateOf(b) - eventDateOf(a))
}

export async function getHeadToHead(playerAId: string, playerBId: string) {
  const pairKey = [playerAId, playerBId].sort().join(':')
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_matches')
    .select(
      'round_number, phase_name, winner_id, is_draw, is_bye, games_won_by_winner, games_won_by_loser, event:tournament_history_events(rph_event_id, event_name, event_date)'
    )
    .eq('player_pair', pairKey)

  if (error) throw error
  return (data ?? []).sort((a, b) => eventDateOf(a) - eventDateOf(b))
}

export async function searchPlayers(query: string, limit = 20) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_standings')
    .select('rph_player_id, player_name, updated_at, event:tournament_history_events(event_name)')
    .ilike('player_name', `%${query}%`)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) throw error

  const seen = new Map<string, { playerId: string; playerName: string; lastSeenEventName: string | null }>()
  for (const row of data ?? []) {
    if (seen.has(row.rph_player_id)) continue
    seen.set(row.rph_player_id, {
      playerId: row.rph_player_id,
      playerName: row.player_name,
      lastSeenEventName: (row.event as any)?.event_name ?? null,
    })
    if (seen.size >= limit) break
  }
  return Array.from(seen.values())
}

// All rph_event_ids already in the archive — used to filter suggested
// discovery candidates down to ones actually worth showing. There are only
// ~100-200 rows here, so a single unfiltered select is fine.
// The DLC / Championship events a side event can hang off (sideEvents.ts).
export async function getMajorParents(): Promise<Array<{ store_name: string | null; event_date: string | null; event_tier: string | null }>> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_events')
    .select('store_name, event_date, event_tier')
    .in('event_tier', ['challenge', 'challenge_championship'])
  if (error) throw error
  return data ?? []
}

export async function getAllImportedEventIds(): Promise<Set<string>> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.from('tournament_history_events').select('rph_event_id')
  if (error) throw error
  return new Set((data ?? []).map((r) => r.rph_event_id))
}

// Tiers that badge the pedigree signal — Continental/National-level
// ("challenge_championship") and DLC/regional-level ("challenge") events.
// Deliberately excludes 'lcq' (Last Chance Qualifier) — common enough to
// make the badge meaningless once the archive fills up.
// TODO(worlds): add 'worlds' once its UUID is known.
export const NOTABLE_EVENT_TIERS = ['challenge_championship', 'challenge']

// Batched lookup for "Notable Pairing Badges": which of the given players
// have made top cut at a notable-tier event (pedigree), and which of the
// given pairs have met before in any imported event (rivalry). Response is
// sparse — callers should treat a missing key as false.
//
// `excludeRphEventId` excludes matches from the tournament currently being
// browsed — otherwise every pairing in an already-imported (e.g. completed)
// event would trivially show as a "rivalry" against itself, since that
// pairing's own match row already exists in the archive.
export async function getPairingBadges(playerIds: string[], pairKeys: string[], excludeRphEventId?: string) {
  const supabase = getSupabaseServiceClient()
  let rivalryQuery = supabase
    .from('tournament_history_matches')
    .select('player_pair, event:tournament_history_events!inner(rph_event_id)')
    .in('player_pair', pairKeys)
  if (excludeRphEventId) rivalryQuery = rivalryQuery.neq('event.rph_event_id', excludeRphEventId)

  const [pedigreeResult, rivalryResult] = await Promise.all([
    playerIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('tournament_history_standings')
          .select('rph_player_id, event:tournament_history_events!inner(event_tier)')
          .in('rph_player_id', playerIds)
          .eq('made_top_cut', true)
          .in('event.event_tier', NOTABLE_EVENT_TIERS),
    pairKeys.length === 0 ? Promise.resolve({ data: [], error: null }) : rivalryQuery,
  ])
  if (pedigreeResult.error) throw pedigreeResult.error
  if (rivalryResult.error) throw rivalryResult.error

  const pedigree: Record<string, true> = {}
  for (const row of pedigreeResult.data ?? []) pedigree[(row as any).rph_player_id] = true
  const rivalry: Record<string, true> = {}
  for (const row of rivalryResult.data ?? []) {
    if ((row as any).player_pair) rivalry[(row as any).player_pair] = true
  }
  return { pedigree, rivalry }
}

export async function listRecentImports(limit = 20) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_events')
    .select('rph_event_id, event_name, event_date, store_name, imported_at, updated_at')
    .order('imported_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

// ---- Public results archive reads (/results/*) ----

const PAGE = 1000 // PostgREST's default max-rows; .range() pages past it.

// Pages a query in PAGE-row ranges until a short page comes back. `build`
// must return a fresh query each call (a PostgREST builder is single-use).
async function fetchAllRanges<T>(build: () => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE) return rows
  }
}

const EVENT_COLUMNS =
  'id, rph_event_id, event_name, event_url, event_date, store_name, gameplay_format, starting_player_count, top_cut_size, has_elimination, total_swiss_rounds, event_tier'

export async function listEvents() {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_events')
    .select(EVENT_COLUMNS)
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('starting_player_count', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

// rank-1 standing per event, keyed by the event's db id.
export async function getWinners(): Promise<Map<string, { playerId: string; playerName: string }>> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_standings')
    .select('event_id, rph_player_id, player_name')
    .eq('rank', 1)
  if (error) throw error
  const out = new Map<string, { playerId: string; playerName: string }>()
  for (const r of data ?? []) out.set(r.event_id, { playerId: r.rph_player_id, playerName: r.player_name })
  return out
}

// The one place raw_event_details is read back: the event page needs the
// elimination phase's name to pick out the bracket.
export async function getEventByRphId(rphEventId: string) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_events')
    .select(`${EVENT_COLUMNS}, raw_event_details`)
    .eq('rph_event_id', rphEventId)
    .maybeSingle()
  if (error) throw error
  return data
}

export function getEventStandings(eventDbId: string) {
  const supabase = getSupabaseServiceClient()
  return fetchAllRanges<any>(() =>
    supabase
      .from('tournament_history_standings')
      .select('rph_player_id, player_name, rank, match_points, record, made_top_cut')
      .eq('event_id', eventDbId)
      .order('rank', { ascending: true, nullsFirst: false })
      .order('id') // stable order across .range() pages
  )
}

const MATCH_COLUMNS =
  'round_number, phase_name, table_number, player1_id, player1_name, player2_id, player2_name, winner_id, is_bye, is_draw, games_won_by_winner, games_won_by_loser'

export async function getEventMatches(eventDbId: string, phaseName: string) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_matches')
    .select(MATCH_COLUMNS)
    .eq('event_id', eventDbId)
    .eq('phase_name', phaseName)
    .order('round_number')
    .order('table_number')
  if (error) throw error
  return data ?? []
}

// `playerId` must already be validated (ID_RE in the route): it is
// interpolated into PostgREST's .or() filter syntax.
export async function getEventPlayerMatches(eventDbId: string, playerId: string) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_matches')
    .select(MATCH_COLUMNS)
    .eq('event_id', eventDbId)
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
    .order('round_number')
  if (error) throw error
  return data ?? []
}

// Every archived match a player appears in, joined to the event id. A
// frequent player across ~20 majors is a few hundred rows; paged anyway.
// Same validation requirement on `playerId` as above.
export function getPlayerMatches(playerId: string) {
  const supabase = getSupabaseServiceClient()
  return fetchAllRanges<any>(() =>
    supabase
      .from('tournament_history_matches')
      .select(`${MATCH_COLUMNS}, event:tournament_history_events(rph_event_id, event_date)`)
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
      .order('id') // stable order across .range() pages
  )
}

// ---- Player ratings (glicko.ts, migration 025) ----

const RATING_UPSERT_CHUNK = 1000

// Rebuilds every rating from scratch: an import can add an older event,
// which changes everything after it. Events and matches are read separately
// and joined here, keeping each paged match read to the columns the math needs.
// ponytail: sequential 1,000-row pages (~140 at 140k matches) inside the
// route's 60 s maxDuration; fetch pages concurrently once the archive outgrows it.
export async function recomputeRatings(): Promise<number> {
  const supabase = getSupabaseServiceClient()
  const startedAt = new Date().toISOString()
  const [eventRows, matchRows] = await Promise.all([
    fetchAllRanges<any>(() =>
      supabase.from('tournament_history_events').select('id, rph_event_id, event_date').order('id')
    ),
    fetchAllRanges<any>(() =>
      supabase
        .from('tournament_history_matches')
        .select('event_id, player1_id, player1_name, player2_id, player2_name, winner_id, is_draw')
        .eq('is_bye', false)
        .order('id')
    ),
  ])

  const events = new Map<string, RatedEvent>(
    eventRows.map((e) => [e.id, { rphEventId: e.rph_event_id, eventDate: e.event_date, matches: [] }])
  )
  // Each player under the name from their latest event.
  const names = new Map<string, { name: string; date: string }>()
  const noteName = (id: string | null, name: string | null, date: string) => {
    if (!id || !name) return
    const seen = names.get(id)
    if (!seen || date >= seen.date) names.set(id, { name, date })
  }
  for (const m of matchRows) {
    const event = events.get(m.event_id)!
    event.matches.push({ player1Id: m.player1_id, player2Id: m.player2_id, winnerId: m.winner_id, isDraw: m.is_draw })
    noteName(m.player1_id, m.player1_name, event.eventDate)
    noteName(m.player2_id, m.player2_name, event.eventDate)
  }

  const rows = [...rateEvents([...events.values()])].map(([playerId, r]) => ({
    player_id: playerId,
    player_name: names.get(playerId)?.name ?? null,
    rating: r.rating,
    rd: r.rd,
    matches: r.matches,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    last_event_date: r.lastEventDate,
    history: r.history,
    updated_at: startedAt,
  }))
  for (let i = 0; i < rows.length; i += RATING_UPSERT_CHUNK) {
    const { error } = await supabase
      .from('tournament_history_ratings')
      .upsert(rows.slice(i, i + RATING_UPSERT_CHUNK), { onConflict: 'player_id' })
    if (error) throw error
  }
  // A player whose rated matches all went away keeps no stale row.
  const { error } = await supabase.from('tournament_history_ratings').delete().lt('updated_at', startedAt)
  if (error) throw error
  return rows.length
}

const RATING_COLUMNS =
  'player_id, player_name, rating, rd, matches, wins, losses, draws, last_event_date, history, updated_at'

// The leaderboard: established players by rating.
export async function getTopRatings(limit: number) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_ratings')
    .select(RATING_COLUMNS)
    .lte('rd', ESTABLISHED_RD)
    .order('rating', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// One player's rating with their rank among established players (null when
// provisional), or null when they have no rated match.
export async function getPlayerRating(playerId: string) {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('tournament_history_ratings')
    .select(RATING_COLUMNS)
    .eq('player_id', playerId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const rating = Number(data.rating)
  const rd = Number(data.rd)
  const established = rd <= ESTABLISHED_RD
  let rank: number | null = null
  if (established) {
    const { count, error: countError } = await supabase
      .from('tournament_history_ratings')
      .select('player_id', { count: 'exact', head: true })
      .lte('rd', ESTABLISHED_RD)
      .gt('rating', rating)
    if (countError) throw countError
    rank = (count ?? 0) + 1
  }
  return { rating, rd, matches: data.matches, rank, established, history: data.history }
}

import { getSupabaseServiceClient } from './discordSupabase.js'

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
      'player_name, rank, match_points, record, made_top_cut, event:tournament_history_events(rph_event_id, event_name, event_date, store_name, top_cut_size, starting_player_count)'
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

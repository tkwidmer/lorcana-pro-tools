// CRUD helpers for the discord_favorite_players table backing the Discord
// bot's /favorite, /unfavorite, /favorites commands and the scheduled
// tournament-tick endpoint. See supabase/migrations/003_discord_favorite_players.sql.
import { getSupabaseServiceClient } from './discordSupabase.js'

export interface FavoriteRow {
  id: string
  guild_id: string
  channel_id: string
  event_id: string
  event_url: string
  player_id: string
  player_name: string
  requested_by: string
  active: boolean
  last_rank: number | null
  last_record: string | null
  last_match_points: number | null
}

export async function addFavorite(row: {
  guildId: string
  channelId: string
  eventId: string
  eventUrl: string
  playerId: string
  playerName: string
  requestedBy: string
  rank: number
  record: string
  matchPoints: number
}): Promise<void> {
  const supabase = getSupabaseServiceClient()
  const { error } = await supabase.from('discord_favorite_players').upsert(
    {
      guild_id: row.guildId,
      channel_id: row.channelId,
      event_id: row.eventId,
      event_url: row.eventUrl,
      player_id: row.playerId,
      player_name: row.playerName,
      requested_by: row.requestedBy,
      active: true,
      last_rank: row.rank,
      last_record: row.record,
      last_match_points: row.matchPoints,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'channel_id,event_id,player_id' }
  )
  if (error) throw new Error(`Failed to save favorite: ${error.message}`)
}

// Deactivates every active favorite in this channel whose player name
// contains the query (case-insensitive) — mirrors the same partial-match
// behavior as /tournament player:. Returns how many rows were removed.
export async function removeFavorites(channelId: string, playerNameQuery: string): Promise<number> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('discord_favorite_players')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('active', true)
    .ilike('player_name', `%${playerNameQuery}%`)
    .select('id')
  if (error) throw new Error(`Failed to remove favorite: ${error.message}`)
  return data?.length ?? 0
}

export async function listActiveFavorites(channelId: string): Promise<FavoriteRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('discord_favorite_players')
    .select('*')
    .eq('channel_id', channelId)
    .eq('active', true)
    .order('player_name', { ascending: true })
  if (error) throw new Error(`Failed to list favorites: ${error.message}`)
  return data ?? []
}

export async function listAllActiveFavorites(): Promise<FavoriteRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.from('discord_favorite_players').select('*').eq('active', true)
  if (error) throw new Error(`Failed to list favorites: ${error.message}`)
  return data ?? []
}

export async function updateFavoriteSnapshot(
  id: string,
  rank: number,
  record: string,
  matchPoints: number
): Promise<void> {
  const supabase = getSupabaseServiceClient()
  const { error } = await supabase
    .from('discord_favorite_players')
    .update({
      last_rank: rank,
      last_record: record,
      last_match_points: matchPoints,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(`Failed to update favorite snapshot: ${error.message}`)
}

// Called by the tick once an event's current round can no longer be
// resolved (tournament finished) — auto-stops tracking for everyone.
export async function deactivateFavoritesForEvent(eventId: string): Promise<void> {
  const supabase = getSupabaseServiceClient()
  const { error } = await supabase
    .from('discord_favorite_players')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('active', true)
  if (error) throw new Error(`Failed to deactivate favorites for event: ${error.message}`)
}

import { getSupabaseServiceClient } from './discordSupabase.js'
import { fetchAllRanges } from './tournamentHistorySupabase.js'
import type { MemberRow, StandingJoinRow } from './teams.js'

// Service-role queries for the Team Tracker tables (supabase/migrations/
// 031_teams.sql). Both tables have zero RLS policies, so this is the only
// way in or out; the rules that decide who may call the writers live in
// api/_lib/teams.ts and api/tournament-history.ts.

export const TEAM_PUBLIC_COLUMNS = 'id, slug, name, url, logo_url, disbanded_on'
export const TEAM_ADMIN_COLUMNS = `${TEAM_PUBLIC_COLUMNS}, manager_user_id, created_at`
const MEMBER_COLUMNS = 'id, team_id, rph_player_id, player_name, joined_on, left_on'
const STANDING_JOIN_COLUMNS =
  'rph_player_id, player_name, rank, record, made_top_cut, made_day_two, inks, event:tournament_history_events(id, rph_event_id, event_name, event_date, store_name, starting_player_count, top_cut_size, event_tier, event_url)'

export interface TeamRow {
  id: string
  slug: string
  name: string
  url: string | null
  logo_url: string | null
  disbanded_on: string | null
  manager_user_id: string | null
  created_at: string
}

// Active teams by name, then disbanded ones by name.
export async function listTeams(): Promise<TeamRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('teams')
    .select(TEAM_ADMIN_COLUMNS)
    .order('disbanded_on', { ascending: true, nullsFirst: true })
    .order('name')
  if (error) throw error
  return (data ?? []) as unknown as TeamRow[]
}

export async function getTeamBySlug(slug: string): Promise<TeamRow | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.from('teams').select(TEAM_ADMIN_COLUMNS).eq('slug', slug).maybeSingle()
  if (error) throw error
  return data as unknown as TeamRow | null
}

export async function getTeamById(id: string): Promise<TeamRow | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.from('teams').select(TEAM_ADMIN_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as TeamRow | null
}

export async function listMembers(teamId: string): Promise<MemberRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('team_members')
    .select(MEMBER_COLUMNS)
    .eq('team_id', teamId)
    .order('joined_on', { ascending: true, nullsFirst: true })
    .order('player_name')
  if (error) throw error
  return (data ?? []) as MemberRow[]
}

export async function listAllMembers(): Promise<MemberRow[]> {
  const supabase = getSupabaseServiceClient()
  return fetchAllRanges<MemberRow>(() => supabase.from('team_members').select(MEMBER_COLUMNS).order('id'))
}

export async function getMemberById(id: string): Promise<MemberRow | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.from('team_members').select(MEMBER_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data as MemberRow | null
}

// Every archived standing for these players, with the event it belongs to.
// Paged, since a roster's history can exceed supabase-js's 1,000-row cap.
export async function getStandingsForPlayers(playerIds: string[]): Promise<StandingJoinRow[]> {
  if (playerIds.length === 0) return []
  const supabase = getSupabaseServiceClient()
  return fetchAllRanges<StandingJoinRow>(() =>
    supabase.from('tournament_history_standings').select(STANDING_JOIN_COLUMNS).in('rph_player_id', playerIds).order('id')
  )
}

export interface TeamUpsert {
  id?: string
  slug?: string
  name: string
  url: string | null
  logo_url: string | null
  manager_user_id?: string | null
}

// Insert when `id` is absent, otherwise update the keys present.
export async function upsertTeam(row: TeamUpsert): Promise<TeamRow> {
  const supabase = getSupabaseServiceClient()
  const { id, ...fields } = row
  const query = id
    ? supabase.from('teams').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    : supabase.from('teams').insert(fields)
  const { data, error } = await query.select(TEAM_ADMIN_COLUMNS).single()
  if (error) throw error
  return data as unknown as TeamRow
}

export interface MemberUpsert {
  id?: string
  team_id: string
  rph_player_id: string
  player_name: string
  joined_on: string | null
  left_on: string | null
}

export async function upsertMember(row: MemberUpsert): Promise<MemberRow> {
  const supabase = getSupabaseServiceClient()
  const { id, ...fields } = row
  const query = id ? supabase.from('team_members').update(fields).eq('id', id) : supabase.from('team_members').insert(fields)
  const { data, error } = await query.select(MEMBER_COLUMNS).single()
  if (error) throw error
  return data as MemberRow
}

export async function deleteMember(id: string): Promise<void> {
  const supabase = getSupabaseServiceClient()
  const { error } = await supabase.from('team_members').delete().eq('id', id)
  if (error) throw error
}

// dissolve_team() / reinstate_team() in migration 031 do the multi-row
// updates atomically; the API decides who may call them.
export async function dissolveTeam(teamId: string): Promise<string> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.rpc('dissolve_team', { p_team_id: teamId })
  if (error) throw error
  return data as string
}

export async function reinstateTeam(teamId: string): Promise<number> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.rpc('reinstate_team', { p_team_id: teamId })
  if (error) throw error
  return data as number
}

export async function listTeamsManagedBy(userId: string): Promise<Array<{ id: string; slug: string; name: string }>> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.from('teams').select('id, slug, name').eq('manager_user_id', userId).order('name')
  if (error) throw error
  return data ?? []
}

export interface PlayerTeamRow {
  joined_on: string
  left_on: string | null
  team: { slug: string; name: string; disbanded_on: string | null } | null
}

export async function listTeamsForPlayer(playerId: string): Promise<PlayerTeamRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('team_members')
    .select('joined_on, left_on, team:teams(slug, name, disbanded_on)')
    .eq('rph_player_id', playerId)
    .order('joined_on', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as PlayerTeamRow[]
}

// Admin list: every team with its manager's email, joined in TS since the
// manager lives in profiles (a second small query).
export async function listTeamsWithManagerEmail(): Promise<Array<TeamRow & { manager_email: string | null }>> {
  const teams = await listTeams()
  const managerIds = Array.from(new Set(teams.map((t) => t.manager_user_id).filter((id): id is string => Boolean(id))))
  const emails = new Map<string, string>()
  if (managerIds.length > 0) {
    const supabase = getSupabaseServiceClient()
    const { data, error } = await supabase.from('profiles').select('user_id, email').in('user_id', managerIds)
    if (error) throw error
    for (const p of data ?? []) emails.set(p.user_id, p.email)
  }
  return teams.map((t) => ({ ...t, manager_email: t.manager_user_id ? (emails.get(t.manager_user_id) ?? null) : null }))
}

export async function memberCounts(): Promise<Map<string, { current: number; former: number }>> {
  const counts = new Map<string, { current: number; former: number }>()
  for (const m of await listAllMembers()) {
    const c = counts.get(m.team_id) ?? { current: 0, former: 0 }
    if (m.left_on === null) c.current += 1
    else c.former += 1
    counts.set(m.team_id, c)
  }
  return counts
}

export async function findProfileByEmail(query: string): Promise<Array<{ user_id: string; email: string }>> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.from('profiles').select('user_id, email').ilike('email', `%${query}%`).order('email').limit(10)
  if (error) throw error
  return data ?? []
}

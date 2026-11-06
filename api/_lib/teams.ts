// Pure Team Tracker rules shared by api/tournament-history.ts's team
// endpoints (spec: docs/superpowers/specs/2026-11-06-team-tracker-design.md).
// Membership on a date is the one rule everything hangs on: a player counts
// for an event when joined_on <= event_date <= left_on (open-ended when
// left_on is null). Dates are ISO yyyy-mm-dd strings and compare lexically.

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length >= 2 && slug.length <= 48 && SLUG_RE.test(slug)
}

export interface MemberRow {
  id: string
  team_id: string
  rph_player_id: string
  player_name: string
  joined_on: string
  left_on: string | null
}

export interface StandingJoinRow {
  rph_player_id: string
  player_name: string
  rank: number | null
  record: string | null
  made_top_cut: boolean | null
  made_day_two: boolean | null
  inks: string[] | null
  event: {
    id: string
    rph_event_id: string
    event_name: string
    event_date: string | null
    store_name: string | null
    starting_player_count: number | null
    top_cut_size: number | null
    event_tier: string | null
    event_url: string | null
  } | null
}

export interface TeamEventResult {
  playerId: string
  playerName: string
  rank: number | null
  record: string | null
  madeTopCut: boolean
  madeDayTwo: boolean
  inks: string[] | null
  former: boolean
}

export interface TeamEvent {
  eventId: string
  eventName: string
  eventDate: string
  storeName: string | null
  startingPlayerCount: number | null
  topCutSize: number | null
  eventTier: string | null
  eventUrl: string | null
  results: TeamEventResult[]
}

export function isMemberOn(member: { joined_on: string; left_on: string | null }, date: string | null): boolean {
  if (!date) return false
  return member.joined_on <= date && (member.left_on === null || member.left_on >= date)
}

const byRank = (a: TeamEventResult, b: TeamEventResult) => (a.rank ?? Infinity) - (b.rank ?? Infinity)

// Standing rows for the members' player ids, joined to their events, folded
// into one entry per event the team "played": a row counts when some
// membership of that player covers the event date (a player may have
// several memberships on the same team over time).
export function groupTeamEvents(members: MemberRow[], rows: StandingJoinRow[]): TeamEvent[] {
  const byPlayer = new Map<string, MemberRow[]>()
  for (const m of members) byPlayer.set(m.rph_player_id, [...(byPlayer.get(m.rph_player_id) ?? []), m])

  const events = new Map<string, TeamEvent>()
  for (const r of rows) {
    const e = r.event
    if (!e?.event_date) continue
    const membership = (byPlayer.get(r.rph_player_id) ?? []).find((m) => isMemberOn(m, e.event_date))
    if (!membership) continue
    let entry = events.get(e.rph_event_id)
    if (!entry) {
      entry = {
        eventId: e.rph_event_id,
        eventName: e.event_name,
        eventDate: e.event_date,
        storeName: e.store_name,
        startingPlayerCount: e.starting_player_count,
        topCutSize: e.top_cut_size,
        eventTier: e.event_tier,
        eventUrl: e.event_url,
        results: [],
      }
      events.set(e.rph_event_id, entry)
    }
    entry.results.push({
      playerId: r.rph_player_id,
      playerName: r.player_name,
      rank: r.rank,
      record: r.record,
      madeTopCut: Boolean(r.made_top_cut),
      madeDayTwo: Boolean(r.made_day_two),
      inks: r.inks,
      former: membership.left_on !== null,
    })
  }
  const out = Array.from(events.values())
  for (const e of out) e.results.sort(byRank)
  return out.sort((a, b) =>
    a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : Number(b.eventId) - Number(a.eventId)
  )
}

export function lastEventOf(events: TeamEvent[]) {
  const e = events[0]
  if (!e) return null
  const ranks = e.results.map((r) => r.rank).filter((r): r is number => r != null)
  return {
    eventId: e.eventId,
    eventName: e.eventName,
    eventDate: e.eventDate,
    bestRank: ranks.length ? Math.min(...ranks) : null,
  }
}

export type EditVerdict = 'ok' | 'forbidden' | 'disbanded'

// Who may change a team: an admin or its manager, and only while it is not
// disbanded. Reinstating is the one admin-only action that works on a
// disbanded team.
export function canEditTeam(
  user: { id: string; isAdmin: boolean },
  team: { manager_user_id: string | null; disbanded_on: string | null },
  action: 'write' | 'reinstate'
): EditVerdict {
  if (action === 'reinstate') return user.isAdmin ? 'ok' : 'forbidden'
  if (!user.isAdmin && team.manager_user_id !== user.id) return 'forbidden'
  if (team.disbanded_on !== null) return 'disbanded'
  return 'ok'
}

// Fields only an admin may send on team-save. A manager who sends them is
// refused outright rather than having them silently dropped.
export function adminOnlyFieldsSent(body: Record<string, unknown>): boolean {
  return body.slug !== undefined || body.managerUserId !== undefined
}

// Logos come from the stream-logos bucket (migration 016); anything else on
// a public page would be hot-linking an arbitrary image.
export function isValidLogoUrl(url: unknown, supabaseUrl: string): boolean {
  return typeof url === 'string' && url.startsWith(`${supabaseUrl}/storage/v1/object/public/stream-logos/`)
}

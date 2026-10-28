// Which archived events count as majors. The archive stores each event's
// official template tier (tournamentImport.ts), but CCQs and the large side
// events of a DLC weekend both sit on generic templates, so tier alone can't
// tell a CCQ from a Fanfinity 6-rounder. A side event is one at the same
// store as a DLC / Championship within the weekend window that isn't on a
// major template itself. Anything else on a generic template is a major only
// at MIN_MAJOR_PLAYERS: the archive also holds CCQ trials, CCQ side events
// and third-party locals imported for their head-to-head history, and above
// 100 players every such event is a CCQ, a cash event or a mistagged DLC.
// The player card and the pairing panel count majors; every finish still
// shows, side events tagged.

export const MAJOR_TIERS = new Set(['challenge', 'challenge_championship', 'lcq'])
const PARENT_TIERS = new Set(['challenge', 'challenge_championship'])
const SIDE_EVENT_WINDOW_DAYS = 3
export const MIN_MAJOR_PLAYERS = 100

export interface ArchivedEventLike {
  store_name: string | null
  event_date: string | null
  event_tier: string | null
  starting_player_count?: number | null
}

export function isParentEvent(e: ArchivedEventLike): boolean {
  return PARENT_TIERS.has(e.event_tier ?? '')
}

export function isSideEvent(e: ArchivedEventLike, parents: ArchivedEventLike[]): boolean {
  if (MAJOR_TIERS.has(e.event_tier ?? '') || !e.store_name || !e.event_date) return false
  const t = Date.parse(e.event_date)
  return parents.some(
    (p) => p.store_name === e.store_name && p.event_date && Math.abs(Date.parse(p.event_date) - t) <= SIDE_EVENT_WINDOW_DAYS * 86_400_000
  )
}

export function isMajor(e: ArchivedEventLike, parents: ArchivedEventLike[]): boolean {
  if (MAJOR_TIERS.has(e.event_tier ?? '')) return true
  return !isSideEvent(e, parents) && (e.starting_player_count ?? 0) >= MIN_MAJOR_PLAYERS
}

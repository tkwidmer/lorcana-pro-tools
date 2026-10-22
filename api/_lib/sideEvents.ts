// Which archived events count as majors. The archive stores each event's
// official template tier (tournamentImport.ts), but CCQs and the large side
// events of a DLC weekend both sit on generic templates, so tier alone can't
// tell a CCQ from a Fanfinity 6-rounder. A side event is one at the same
// store as a DLC / Championship within the weekend window that isn't on a
// major template itself; everything else is a major. The player card and
// the pairing panel count majors; side-event finishes still show, tagged.

export const MAJOR_TIERS = new Set(['challenge', 'challenge_championship', 'lcq'])
const PARENT_TIERS = new Set(['challenge', 'challenge_championship'])
const SIDE_EVENT_WINDOW_DAYS = 3

export interface ArchivedEventLike {
  store_name: string | null
  event_date: string | null
  event_tier: string | null
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

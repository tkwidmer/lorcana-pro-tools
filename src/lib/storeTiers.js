// Ravensburger Play Hub store tier logic, per the Aug 2026 "Store Tiers and
// Benefits" program email. Only the pro-rating window is modeled here (the
// immediate, time-boxed ask): stores earn provisional Legendary status by
// hitting 1/6 of the full-year Legendary requirements between Sep 1 and
// Nov 1, 2026, plus running a Hyperia City Prerelease.
export const PRORATE_WINDOW = {
  start: '2026-09-01T00:00:00Z',
  end: '2026-11-01T00:00:00Z',
}

export const LEGENDARY_PRORATED_REQUIREMENTS = {
  totalEvents: 8,
  uniqueFans: 8,
  eventTickets: 80,
}

export function isPrereleaseEvent(name) {
  return /prerelease/i.test(name ?? '')
}

export function isHyperiaCityPrerelease(name) {
  return isPrereleaseEvent(name) && /hyperia/i.test(name ?? '')
}

// Only events RPH considers actually played and reported count toward tiering.
export function isReportedEvent(event) {
  return event?.display_status === 'complete'
}

export function eventsInWindow(events, windowStart = PRORATE_WINDOW.start, windowEnd = PRORATE_WINDOW.end) {
  const start = new Date(windowStart).getTime()
  const end = new Date(windowEnd).getTime()
  return (events ?? []).filter((event) => {
    if (!isReportedEvent(event)) return false
    const t = new Date(event.start_datetime).getTime()
    return Number.isFinite(t) && t >= start && t < end
  })
}

// `events` should already be filtered to the window (e.g. via eventsInWindow).
// `uniqueFanCount` is the count of distinct registrants across those events,
// computed separately since it requires per-event registration lookups.
export function computeTierProgress(events, uniqueFanCount, requirements = LEGENDARY_PRORATED_REQUIREMENTS) {
  const totalEvents = events.length
  const eventTickets = events.reduce((sum, event) => sum + (event.starting_player_count || 0), 0)
  const hasHyperiaPrerelease = events.some((event) => isHyperiaCityPrerelease(event.name))

  const meetsProvisionalLegendary =
    totalEvents >= requirements.totalEvents &&
    uniqueFanCount >= requirements.uniqueFans &&
    eventTickets >= requirements.eventTickets &&
    hasHyperiaPrerelease

  return {
    totalEvents,
    eventTickets,
    uniqueFans: uniqueFanCount,
    hasHyperiaPrerelease,
    requirements,
    meetsProvisionalLegendary,
  }
}

// --- Steady-state tiering (after the pro-rating window ends) ---
//
// RPH's normal Standard/Legendary maintenance bars are evaluated "over the
// course of the four (4) most recent set seasons." The API doesn't expose
// set release dates, but RPH's own rule — "run Prerelease Events for all
// available sets" — means a store's own Prerelease event history functionally
// *is* its set-season boundaries: each new set season begins when a store
// runs that set's Prerelease. A store sometimes runs more than one Prerelease
// session for the same set (e.g. a Saturday sealed pod and a Wednesday
// makeup pod a few days later), so nearby Prerelease events within
// `mergeWindowDays` are treated as the same season rather than two.
const DEFAULT_SEASON_MERGE_WINDOW_DAYS = 30

export function deriveSeasons(events, mergeWindowDays = DEFAULT_SEASON_MERGE_WINDOW_DAYS) {
  const prereleases = (events ?? [])
    .filter((event) => isReportedEvent(event) && isPrereleaseEvent(event.name))
    .map((event) => ({ name: event.name, start: event.start_datetime }))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const mergeWindowMs = mergeWindowDays * 24 * 60 * 60 * 1000
  const anchors = []
  for (const prerelease of prereleases) {
    const last = anchors[anchors.length - 1]
    if (last && new Date(prerelease.start).getTime() - new Date(last.start).getTime() <= mergeWindowMs) {
      continue // same set season as the previous Prerelease anchor
    }
    anchors.push(prerelease)
  }

  // end: null means the season is still ongoing (runs through now).
  return anchors.map((anchor, i) => ({
    name: anchor.name,
    start: anchor.start,
    end: i + 1 < anchors.length ? anchors[i + 1].start : null,
  }))
}

export const STANDARD_MAINTENANCE_REQUIREMENTS = {
  totalEvents: 25,
  uniqueFans: 25,
  eventTickets: 250,
}

export const LEGENDARY_MAINTENANCE_REQUIREMENTS = {
  totalEvents: 50,
  uniqueFans: 50,
  eventTickets: 500,
}

// Derives season boundaries and returns the events eligible for the trailing
// `seasonCount` seasons. Exposed separately from computeStandingTierStatus so
// callers can fetch unique-fan registrations for exactly this event set
// before computing the final status.
export function standingWindowEvents(events, seasonCount = 4) {
  const reported = (events ?? []).filter(isReportedEvent)
  const seasons = deriveSeasons(reported)

  if (seasons.length === 0) {
    return { seasons, recentSeasons: [], eligibleEvents: [] }
  }

  const recentSeasons = seasons.slice(-seasonCount)
  const windowStartMs = new Date(recentSeasons[0].start).getTime()
  const eligibleEvents = reported.filter((event) => new Date(event.start_datetime).getTime() >= windowStartMs)

  return { seasons, recentSeasons, eligibleEvents }
}

// `events` should be a store's full reported event history (not window-
// filtered) — this derives season boundaries and the eligible window itself.
// `uniqueFanCount` is the distinct-registrant count across the eligible
// events (from standingWindowEvents), computed separately (same reasoning as
// computeTierProgress).
export function computeStandingTierStatus(events, uniqueFanCount, seasonCount = 4) {
  const { recentSeasons, eligibleEvents } = standingWindowEvents(events, seasonCount)

  if (recentSeasons.length === 0) {
    return {
      seasonsAvailable: 0,
      windowStart: null,
      eligibleEvents: [],
      tier: 'welcome',
      insufficientHistory: true,
    }
  }

  const totalEvents = eligibleEvents.length
  const eventTickets = eligibleEvents.reduce((sum, event) => sum + (event.starting_player_count || 0), 0)
  // Every derived season is anchored on a Prerelease by construction, so this
  // is always "1 per season" — it exists to surface the count, and to cap
  // the requirement for stores newer than `seasonCount` seasons (per RPH's
  // "if you have been in RPH for less than 4 sets, this number will be the
  // number you have been eligible for so far").
  const prereleaseCount = recentSeasons.length
  const prereleaseRequirement = Math.min(seasonCount, recentSeasons.length)

  const meetsRequirements = (requirements) =>
    totalEvents >= requirements.totalEvents &&
    uniqueFanCount >= requirements.uniqueFans &&
    eventTickets >= requirements.eventTickets &&
    prereleaseCount >= prereleaseRequirement

  const meetsLegendary = meetsRequirements(LEGENDARY_MAINTENANCE_REQUIREMENTS)
  const meetsStandard = meetsRequirements(STANDARD_MAINTENANCE_REQUIREMENTS)
  const tier = meetsLegendary ? 'legendary' : meetsStandard ? 'standard' : 'welcome'

  return {
    seasonsAvailable: recentSeasons.length,
    windowStart: recentSeasons[0].start,
    tier,
    metrics: { totalEvents, eventTickets, uniqueFans: uniqueFanCount, prereleaseCount, prereleaseRequirement },
    standardRequirements: STANDARD_MAINTENANCE_REQUIREMENTS,
    legendaryRequirements: LEGENDARY_MAINTENANCE_REQUIREMENTS,
    insufficientHistory: false,
  }
}

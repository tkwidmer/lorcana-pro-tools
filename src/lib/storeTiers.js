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

import { describe, it, expect } from 'vitest'
import {
  isPrereleaseEvent,
  isHyperiaCityPrerelease,
  isReportedEvent,
  eventsInWindow,
  computeTierProgress,
  LEGENDARY_PRORATED_REQUIREMENTS,
} from '../storeTiers'

function makeEvent(overrides = {}) {
  return {
    id: 1,
    name: 'Wednesday Evening Weekly Play (Constructed)',
    display_status: 'complete',
    start_datetime: '2026-09-15T00:00:00Z',
    starting_player_count: 8,
    ...overrides,
  }
}

describe('isPrereleaseEvent', () => {
  it('matches "prerelease" case-insensitively', () => {
    expect(isPrereleaseEvent('Hyperia City Prerelease')).toBe(true)
    expect(isPrereleaseEvent('HYPERIA CITY PRERELEASE')).toBe(true)
    expect(isPrereleaseEvent('Weekly Play (Constructed)')).toBe(false)
  })

  it('returns false for missing input', () => {
    expect(isPrereleaseEvent(undefined)).toBe(false)
    expect(isPrereleaseEvent(null)).toBe(false)
  })
})

describe('isHyperiaCityPrerelease', () => {
  it('requires both "hyperia" and "prerelease"', () => {
    expect(isHyperiaCityPrerelease('Saturday Hyperia City Prerelease')).toBe(true)
    expect(isHyperiaCityPrerelease('Wilds Unknown Prerelease')).toBe(false)
    expect(isHyperiaCityPrerelease('Hyperia City Set Championship')).toBe(false)
  })
})

describe('isReportedEvent', () => {
  it('only treats display_status "complete" as reported', () => {
    expect(isReportedEvent(makeEvent({ display_status: 'complete' }))).toBe(true)
    expect(isReportedEvent(makeEvent({ display_status: 'upcoming' }))).toBe(false)
    expect(isReportedEvent(makeEvent({ display_status: 'inProgress' }))).toBe(false)
    expect(isReportedEvent(null)).toBe(false)
  })
})

describe('eventsInWindow', () => {
  const start = '2026-09-01T00:00:00Z'
  const end = '2026-11-01T00:00:00Z'

  it('keeps only reported events within [start, end)', () => {
    const events = [
      makeEvent({ id: 1, start_datetime: '2026-08-31T23:59:00Z' }), // before window
      makeEvent({ id: 2, start_datetime: '2026-09-01T00:00:00Z' }), // window start, inclusive
      makeEvent({ id: 3, start_datetime: '2026-10-31T23:59:00Z' }), // inside window
      makeEvent({ id: 4, start_datetime: '2026-11-01T00:00:00Z' }), // window end, exclusive
      makeEvent({ id: 5, start_datetime: '2026-09-15T00:00:00Z', display_status: 'upcoming' }), // not reported
    ]
    const filtered = eventsInWindow(events, start, end)
    expect(filtered.map((e) => e.id)).toEqual([2, 3])
  })

  it('defaults to the pro-rating window when no bounds are given', () => {
    const events = [makeEvent({ start_datetime: '2026-09-15T00:00:00Z' })]
    expect(eventsInWindow(events)).toHaveLength(1)
  })

  it('handles an empty or missing event list', () => {
    expect(eventsInWindow([], start, end)).toEqual([])
    expect(eventsInWindow(undefined, start, end)).toEqual([])
  })
})

describe('computeTierProgress', () => {
  it('sums tickets, detects Hyperia prerelease, and flags provisional Legendary when all thresholds are met', () => {
    const events = [
      makeEvent({ id: 1, starting_player_count: 20 }),
      makeEvent({ id: 2, starting_player_count: 20 }),
      makeEvent({ id: 3, starting_player_count: 20 }),
      makeEvent({ id: 4, starting_player_count: 20, name: 'Hyperia City Prerelease' }),
      makeEvent({ id: 5, starting_player_count: 20 }),
      makeEvent({ id: 6, starting_player_count: 20 }),
      makeEvent({ id: 7, starting_player_count: 20 }),
      makeEvent({ id: 8, starting_player_count: 20 }),
    ]
    const progress = computeTierProgress(events, 8)

    expect(progress.totalEvents).toBe(8)
    expect(progress.eventTickets).toBe(160)
    expect(progress.uniqueFans).toBe(8)
    expect(progress.hasHyperiaPrerelease).toBe(true)
    expect(progress.requirements).toBe(LEGENDARY_PRORATED_REQUIREMENTS)
    expect(progress.meetsProvisionalLegendary).toBe(true)
  })

  it('is not on pace when any single requirement is short', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent({ id: i, starting_player_count: 20, name: i === 0 ? 'Hyperia City Prerelease' : undefined })
    )

    // Falls short on unique fans only
    expect(computeTierProgress(events, 5).meetsProvisionalLegendary).toBe(false)
    // Falls short on tickets only
    const lowTicketEvents = events.map((e) => ({ ...e, starting_player_count: 1 }))
    expect(computeTierProgress(lowTicketEvents, 8).meetsProvisionalLegendary).toBe(false)
    // No Hyperia City Prerelease at all
    const noPrerelease = events.map((e) => ({ ...e, name: 'Weekly Play' }))
    expect(computeTierProgress(noPrerelease, 8).meetsProvisionalLegendary).toBe(false)
    // Not enough events
    expect(computeTierProgress(events.slice(0, 7), 8).meetsProvisionalLegendary).toBe(false)
  })

  it('treats missing starting_player_count as zero tickets', () => {
    const events = [makeEvent({ starting_player_count: undefined })]
    expect(computeTierProgress(events, 0).eventTickets).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import {
  isPrereleaseEvent,
  isHyperiaCityPrerelease,
  isReportedEvent,
  eventsInWindow,
  computeTierProgress,
  LEGENDARY_PRORATED_REQUIREMENTS,
  deriveSeasons,
  standingWindowEvents,
  computeStandingTierStatus,
  STANDARD_MAINTENANCE_REQUIREMENTS,
  LEGENDARY_MAINTENANCE_REQUIREMENTS,
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

  it('matches hyphenated/spaced "pre-release" variants stores actually use', () => {
    // Real-world example that was silently missed before this regex was
    // broadened, collapsing a store's derived season history to ~3 weeks.
    expect(isPrereleaseEvent('Wilds Unknown Pre-release!!')).toBe(true)
    expect(isPrereleaseEvent('Wilds Unknown Pre release')).toBe(true)
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

describe('deriveSeasons', () => {
  it('anchors one season per Prerelease, in chronological order', () => {
    const events = [
      makeEvent({ id: 1, name: 'Weekly Play', start_datetime: '2026-01-10T00:00:00Z' }),
      makeEvent({ id: 2, name: 'WinterSpell Prerelease', start_datetime: '2026-02-19T00:00:00Z' }),
      makeEvent({ id: 3, name: 'Wilds Unknown Prerelease (Sealed)', start_datetime: '2026-05-09T00:00:00Z' }),
      makeEvent({ id: 4, name: 'Hyperia City Prerelease', start_datetime: '2026-07-18T00:00:00Z' }),
    ]
    const seasons = deriveSeasons(events)
    expect(seasons.map((s) => s.name)).toEqual([
      'WinterSpell Prerelease',
      'Wilds Unknown Prerelease (Sealed)',
      'Hyperia City Prerelease',
    ])
    expect(seasons[0].end).toBe(seasons[1].start)
    expect(seasons[2].end).toBeNull() // most recent season is ongoing
  })

  it('merges Prerelease events run close together into a single season', () => {
    const events = [
      makeEvent({ id: 1, name: 'Wilds Unknown Prerelease (Sealed)', start_datetime: '2026-05-09T00:00:00Z' }),
      makeEvent({ id: 2, name: 'Wilds Unknown Prerelease (Sealed)', start_datetime: '2026-05-14T00:00:00Z' }), // 5 days later
    ]
    expect(deriveSeasons(events)).toHaveLength(1)
  })

  it('ignores unreported (upcoming/in-progress) Prerelease events', () => {
    const events = [makeEvent({ name: 'Hyperia City Prerelease', display_status: 'upcoming' })]
    expect(deriveSeasons(events)).toHaveLength(0)
  })

  it('picks up a hyphenated "Pre-release" anchor (regression: Victory Point Cafe)', () => {
    // A real store ran "Winterspell...", then "Wilds Unknown Pre-release!!",
    // then "...Prerelease Sealed" for the next set. The hyphenated middle
    // event used to be missed entirely, leaving only the most recent
    // Prerelease as an anchor and collapsing the standing window to ~3 weeks.
    const events = [
      makeEvent({ id: 1, name: 'Wilds Unknown Pre-release!!', start_datetime: '2026-05-10T00:00:00Z' }),
      makeEvent({ id: 2, name: 'ATTACK OF THE VINE! Prerelease Sealed', start_datetime: '2026-07-24T00:00:00Z' }),
    ]
    const seasons = deriveSeasons(events)
    expect(seasons).toHaveLength(2)
    expect(seasons[0].name).toBe('Wilds Unknown Pre-release!!')
  })

  it('returns an empty list when there is no Prerelease history', () => {
    expect(deriveSeasons([makeEvent({ name: 'Weekly Play' })])).toHaveLength(0)
    expect(deriveSeasons(undefined)).toHaveLength(0)
  })
})

describe('standingWindowEvents', () => {
  it('includes only events from the trailing N seasons onward', () => {
    const events = [
      makeEvent({ id: 1, name: 'Weekly Play', start_datetime: '2025-06-01T00:00:00Z' }), // before any season
      makeEvent({ id: 2, name: 'Set A Prerelease', start_datetime: '2025-09-01T00:00:00Z' }),
      makeEvent({ id: 3, name: 'Weekly Play', start_datetime: '2025-10-01T00:00:00Z' }),
      makeEvent({ id: 4, name: 'Set B Prerelease', start_datetime: '2026-01-01T00:00:00Z' }),
      makeEvent({ id: 5, name: 'Weekly Play', start_datetime: '2026-02-01T00:00:00Z' }),
    ]
    const { recentSeasons, eligibleEvents } = standingWindowEvents(events, 1)
    expect(recentSeasons).toHaveLength(1)
    expect(eligibleEvents.map((e) => e.id)).toEqual([4, 5])
  })

  it('returns no eligible events when there is no Prerelease history', () => {
    expect(standingWindowEvents([makeEvent({ name: 'Weekly Play' })]).eligibleEvents).toEqual([])
  })
})

describe('computeStandingTierStatus', () => {
  function seasonEvents({ seasons, ticketsPerEvent = 30, eventsPerSeason = 13 }) {
    const events = []
    seasons.forEach((seasonStart, seasonIndex) => {
      events.push(
        makeEvent({
          id: `${seasonIndex}-prerelease`,
          name: `Set ${seasonIndex} Prerelease`,
          start_datetime: seasonStart,
          starting_player_count: ticketsPerEvent,
        })
      )
      for (let i = 1; i < eventsPerSeason; i++) {
        const d = new Date(seasonStart)
        d.setDate(d.getDate() + i * 5)
        events.push(
          makeEvent({
            id: `${seasonIndex}-${i}`,
            name: 'Weekly Play',
            start_datetime: d.toISOString(),
            starting_player_count: ticketsPerEvent,
          })
        )
      }
    })
    return events
  }

  it('reports insufficient history with no Prerelease events at all', () => {
    const status = computeStandingTierStatus([makeEvent({ name: 'Weekly Play' })], 0)
    expect(status.insufficientHistory).toBe(true)
    expect(status.tier).toBe('welcome')
  })

  it('classifies Legendary when totals clear the maintenance bar across 4 seasons', () => {
    const seasons = ['2025-01-01T00:00:00Z', '2025-04-01T00:00:00Z', '2025-07-01T00:00:00Z', '2025-10-01T00:00:00Z']
    const events = seasonEvents({ seasons, eventsPerSeason: 13, ticketsPerEvent: 40 }) // 52 events, 2080 tickets
    const status = computeStandingTierStatus(events, 60)

    expect(status.seasonsAvailable).toBe(4)
    expect(status.metrics.totalEvents).toBeGreaterThanOrEqual(LEGENDARY_MAINTENANCE_REQUIREMENTS.totalEvents)
    expect(status.metrics.prereleaseCount).toBe(4)
    expect(status.tier).toBe('legendary')
  })

  it('classifies Standard when totals clear the Standard but not the Legendary bar', () => {
    const seasons = ['2025-01-01T00:00:00Z', '2025-04-01T00:00:00Z', '2025-07-01T00:00:00Z', '2025-10-01T00:00:00Z']
    const events = seasonEvents({ seasons, eventsPerSeason: 7, ticketsPerEvent: 10 }) // 28 events, 280 tickets
    const status = computeStandingTierStatus(events, 26)

    expect(status.metrics.totalEvents).toBeGreaterThanOrEqual(STANDARD_MAINTENANCE_REQUIREMENTS.totalEvents)
    expect(status.metrics.totalEvents).toBeLessThan(LEGENDARY_MAINTENANCE_REQUIREMENTS.totalEvents)
    expect(status.tier).toBe('standard')
  })

  it('falls back to Welcome when metrics fall short', () => {
    const seasons = ['2025-10-01T00:00:00Z']
    const events = seasonEvents({ seasons, eventsPerSeason: 3, ticketsPerEvent: 5 })
    const status = computeStandingTierStatus(events, 3)

    expect(status.tier).toBe('welcome')
    expect(status.seasonsAvailable).toBe(1)
  })

  it('caps the Prerelease requirement for stores newer than the season count', () => {
    const seasons = ['2025-10-01T00:00:00Z', '2026-01-01T00:00:00Z'] // only 2 seasons of history
    const events = seasonEvents({ seasons, eventsPerSeason: 13, ticketsPerEvent: 40 })
    const status = computeStandingTierStatus(events, 30)

    expect(status.seasonsAvailable).toBe(2)
    expect(status.metrics.prereleaseRequirement).toBe(2)
    expect(status.metrics.prereleaseCount).toBe(2)
  })
})

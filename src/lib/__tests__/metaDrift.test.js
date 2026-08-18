import { describe, it, expect } from 'vitest'
import { computeMetaDrift } from '../metaDrift'

const snap = (matchups) => ({ matchups })

describe('computeMetaDrift', () => {
  it('returns empty for missing snapshots', () => {
    expect(computeMetaDrift(null, snap([]))).toEqual([])
    expect(computeMetaDrift(snap([]), null)).toEqual([])
  })

  it('computes winRate and games deltas for a matchup present in both snapshots', () => {
    const from = snap([{ colorsA: ['ruby'], colorsB: ['sapphire'], winRate: 50, games: 100 }])
    const to = snap([{ colorsA: ['ruby'], colorsB: ['sapphire'], winRate: 58, games: 140 }])
    const rows = computeMetaDrift(from, to)
    expect(rows).toHaveLength(1)
    expect(rows[0].winRateDelta).toBe(8)
    expect(rows[0].gamesDelta).toBe(40)
    expect(rows[0].isNew).toBe(false)
    expect(rows[0].isGone).toBe(false)
  })

  it('matches a matchup regardless of colorsA/colorsB order', () => {
    const from = snap([{ colorsA: ['ruby'], colorsB: ['sapphire'], winRate: 50, games: 100 }])
    const to = snap([{ colorsA: ['sapphire'], colorsB: ['ruby'], winRate: 55, games: 100 }])
    const rows = computeMetaDrift(from, to)
    expect(rows).toHaveLength(1)
    expect(rows[0].winRateDelta).toBe(5)
  })

  it('marks a matchup only present in the newer snapshot as new', () => {
    const from = snap([])
    const to = snap([{ colorsA: ['ruby'], colorsB: ['sapphire'], winRate: 50, games: 20 }])
    const rows = computeMetaDrift(from, to)
    expect(rows[0].isNew).toBe(true)
    expect(rows[0].winRateDelta).toBeNull()
  })

  it('marks a matchup only present in the older snapshot as gone', () => {
    const from = snap([{ colorsA: ['ruby'], colorsB: ['sapphire'], winRate: 50, games: 20 }])
    const to = snap([])
    const rows = computeMetaDrift(from, to)
    expect(rows[0].isGone).toBe(true)
    expect(rows[0].winRateDelta).toBeNull()
  })

  it('sorts by absolute winRate delta descending', () => {
    const from = snap([
      { colorsA: ['ruby'], colorsB: ['sapphire'], winRate: 50, games: 100 },
      { colorsA: ['amber'], colorsB: ['emerald'], winRate: 50, games: 100 },
    ])
    const to = snap([
      { colorsA: ['ruby'], colorsB: ['sapphire'], winRate: 51, games: 100 },
      { colorsA: ['amber'], colorsB: ['emerald'], winRate: 65, games: 100 },
    ])
    const rows = computeMetaDrift(from, to)
    expect(rows[0].colorsA).toEqual(['amber'])
  })
})

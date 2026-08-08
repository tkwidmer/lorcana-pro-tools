import { describe, it, expect } from 'vitest'
import { wilsonInterval, shrinkWR, runMonteCarlo } from '../practiceSim'

describe('wilsonInterval', () => {
  it('returns the full [0,1] range for zero games', () => {
    expect(wilsonInterval(0, 0)).toEqual([0, 1])
  })

  it('returns a bounded interval that contains the observed win rate', () => {
    const [lo, hi] = wilsonInterval(60, 100)
    expect(lo).toBeLessThanOrEqual(0.6)
    expect(hi).toBeGreaterThanOrEqual(0.6)
    expect(lo).toBeGreaterThanOrEqual(0)
    expect(hi).toBeLessThanOrEqual(1)
  })

  it('narrows as the sample size grows', () => {
    const [lo1, hi1] = wilsonInterval(50, 100)
    const [lo2, hi2] = wilsonInterval(500, 1000)
    expect(hi2 - lo2).toBeLessThan(hi1 - lo1)
  })
})

describe('shrinkWR', () => {
  it('falls back to raw win rate when no public WR prior is given', () => {
    expect(shrinkWR(5, 10, null)).toBe(0.5)
    expect(shrinkWR(0, 0, null)).toBe(0.5)
  })

  it('shrinks a small sample toward the public win rate', () => {
    // 1 win in 1 game (100%) should shrink hard toward a 50% public prior.
    const shrunk = shrinkWR(1, 1, 50, 10)
    expect(shrunk).toBeLessThan(1)
    expect(shrunk).toBeGreaterThan(0.5)
  })

  it('barely shrinks a large sample', () => {
    const shrunk = shrinkWR(600, 1000, 50, 10)
    expect(shrunk).toBeCloseTo(0.6, 1)
  })
})

describe('runMonteCarlo', () => {
  it('returns null when there are no opponents with positive meta share', () => {
    expect(runMonteCarlo({ rows: [], rounds: 5, format: 'bo1', sims: 100 })).toBeNull()
  })

  it('produces a record distribution summing to the simulation count', () => {
    const rows = [{ normalizedMeta: 1, wrPlay: 1, wrDraw: 1 }]
    const result = runMonteCarlo({ rows, rounds: 3, format: 'bo1', sims: 50 })
    const total = result.recordCounts.reduce((s, c) => s + c, 0)
    expect(total).toBe(50)
  })

  it('always wins every round when facing a guaranteed-loss opponent', () => {
    const rows = [{ normalizedMeta: 1, wrPlay: 1, wrDraw: 1 }]
    const result = runMonteCarlo({ rows, rounds: 3, format: 'bo3', sims: 20 })
    expect(result.recordCounts[3]).toBe(20)
    expect(result.expectedMatchWR).toBeCloseTo(100, 5)
  })

  it('always loses every round when facing a guaranteed-win opponent', () => {
    const rows = [{ normalizedMeta: 1, wrPlay: 0, wrDraw: 0 }]
    const result = runMonteCarlo({ rows, rounds: 3, format: 'bo1', sims: 20 })
    expect(result.recordCounts[0]).toBe(20)
    expect(result.expectedMatchWR).toBeCloseTo(0, 5)
  })
})

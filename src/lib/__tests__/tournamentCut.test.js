import { describe, it, expect } from 'vitest'
import {
  multinomialCoeff,
  expectedAboveWinLoss,
  expectedAboveTrinomial,
  cutlineFrom,
  estimateCutlineRange,
  cutlineLabel,
} from '../tournamentCut'

describe('multinomialCoeff', () => {
  it('matches known binomial coefficients (b=0 reduces to C(n,a))', () => {
    expect(multinomialCoeff(5, 2, 0)).toBeCloseTo(10, 6)
    expect(multinomialCoeff(4, 0, 0)).toBeCloseTo(1, 6)
  })

  it('returns 0 when a+b exceeds n', () => {
    expect(multinomialCoeff(3, 2, 2)).toBe(0)
  })
})

describe('expectedAboveWinLoss', () => {
  it('returns N when minPoints is 0 (everyone qualifies)', () => {
    expect(expectedAboveWinLoss(100, 5, 0)).toBeCloseTo(100, 6)
  })

  it('returns ~0 when minPoints exceeds the maximum possible score', () => {
    expect(expectedAboveWinLoss(100, 5, 100)).toBeCloseTo(0, 6)
  })

  it('decreases as the points requirement increases', () => {
    const low = expectedAboveWinLoss(200, 8, 12)
    const high = expectedAboveWinLoss(200, 8, 21)
    expect(high).toBeLessThan(low)
  })
})

describe('expectedAboveTrinomial', () => {
  it('returns N when minPoints is 0', () => {
    expect(expectedAboveTrinomial(100, 5, 0, 0.2)).toBeCloseTo(100, 6)
  })

  it('decreases as the points requirement increases', () => {
    const low = expectedAboveTrinomial(200, 8, 12, 0.2)
    const high = expectedAboveTrinomial(200, 8, 21, 0.2)
    expect(high).toBeLessThan(low)
  })
})

describe('cutlineFrom', () => {
  it('finds the minimum points where the expected-above count drops to the target', () => {
    // A step function: expected count is 50 below 10 points, 0 at/above.
    const fn = (N, R, pts) => (pts >= 10 ? 0 : 50)
    expect(cutlineFrom(fn, 200, 8, 5)).toBe(10)
  })

  it('caps at R*3 when the target is never reached', () => {
    const fn = () => 999
    expect(cutlineFrom(fn, 200, 8, 5)).toBe(24)
  })
})

describe('estimateCutlineRange', () => {
  it('returns lower <= upper', () => {
    const { lower, upper } = estimateCutlineRange(200, 8, 32)
    expect(lower).toBeLessThanOrEqual(upper)
  })

  it('uses a derived draw rate when drawCount is supplied', () => {
    const withDraws = estimateCutlineRange(200, 8, 32, 40)
    const withoutDraws = estimateCutlineRange(200, 8, 32)
    // Both are valid ranges; just confirm supplying drawCount doesn't break invariants.
    expect(withDraws.lower).toBeLessThanOrEqual(withDraws.upper)
    expect(withoutDraws.lower).toBeLessThanOrEqual(withoutDraws.upper)
  })
})

describe('cutlineLabel', () => {
  it('formats a single point value when lower equals upper', () => {
    expect(cutlineLabel({ lower: 18, upper: 18 })).toBe('~18 pts')
  })

  it('formats a range when lower differs from upper', () => {
    expect(cutlineLabel({ lower: 15, upper: 18 })).toBe('~15–18 pts')
  })
})

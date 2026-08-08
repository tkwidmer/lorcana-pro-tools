import { describe, it, expect } from 'vitest'
import { logFact, logBinom, drawOdds, jointDrawOddsN, drawOddsAtLeast, pct } from '../drawOddsMath'

describe('logFact', () => {
  it('returns 0 for n <= 1', () => {
    expect(logFact(0)).toBe(0)
    expect(logFact(1)).toBe(0)
  })

  it('matches ln(n!) for small n', () => {
    expect(logFact(5)).toBeCloseTo(Math.log(120), 6)
  })
})

describe('logBinom', () => {
  it('returns -Infinity for out-of-range k', () => {
    expect(logBinom(5, -1)).toBe(-Infinity)
    expect(logBinom(5, 6)).toBe(-Infinity)
  })

  it('matches known binomial coefficients', () => {
    expect(Math.exp(logBinom(5, 0))).toBeCloseTo(1, 6)
    expect(Math.exp(logBinom(5, 5))).toBeCloseTo(1, 6)
    expect(Math.exp(logBinom(5, 2))).toBeCloseTo(10, 5)
  })
})

describe('drawOdds', () => {
  it('is 100% when every deck slot is a copy of the card', () => {
    expect(drawOdds(7, 7, 0, 0)).toBeCloseTo(1, 6)
  })

  it('is 0% when there are no copies in the deck', () => {
    expect(drawOdds(60, 0, 0, 0)).toBe(0)
  })

  it('increases as more copies are added to the deck', () => {
    const p1 = drawOdds(60, 4, 0, 0)
    const p2 = drawOdds(60, 8, 0, 0)
    expect(p2).toBeGreaterThan(p1)
  })

  it('increases with more gameplay draws', () => {
    const pNoDraws = drawOdds(60, 4, 0, 0)
    const pWithDraws = drawOdds(60, 4, 0, 5)
    expect(pWithDraws).toBeGreaterThan(pNoDraws)
  })

  it('increases with a mulligan', () => {
    const pNoMull = drawOdds(60, 4, 0, 0)
    const pWithMull = drawOdds(60, 4, 3, 0)
    expect(pWithMull).toBeGreaterThan(pNoMull)
  })
})

describe('jointDrawOddsN', () => {
  it('matches drawOdds for a single group', () => {
    expect(jointDrawOddsN(60, [4], 0, 0)).toBeCloseTo(drawOdds(60, 4, 0, 0), 6)
  })

  it('is lower than either individual group probability (needs both)', () => {
    const joint = jointDrawOddsN(60, [4, 4], 0, 0)
    const single = drawOdds(60, 4, 0, 0)
    expect(joint).toBeLessThanOrEqual(single)
  })
})

describe('drawOddsAtLeast', () => {
  it('returns 1 when minCopies is 0 or less', () => {
    expect(drawOddsAtLeast(60, 4, 7, 0)).toBe(1)
  })

  it('returns 0 when the deck has fewer copies than required', () => {
    expect(drawOddsAtLeast(60, 1, 7, 2)).toBe(0)
  })

  it('returns 1 when every copy in the deck must be drawn and all fit in the draw', () => {
    expect(drawOddsAtLeast(7, 7, 7, 1)).toBeCloseTo(1, 6)
  })

  it('decreases as minCopies required increases', () => {
    const p1 = drawOddsAtLeast(60, 4, 7, 1)
    const p2 = drawOddsAtLeast(60, 4, 7, 2)
    expect(p2).toBeLessThan(p1)
  })
})

describe('pct', () => {
  it('formats as a percentage with one decimal', () => {
    expect(pct(0.5)).toBe('50.0%')
    expect(pct(0.123)).toBe('12.3%')
  })

  it('collapses anything >= 99.5% to "99%+"', () => {
    expect(pct(0.995)).toBe('99%+')
    expect(pct(1)).toBe('99%+')
  })
})

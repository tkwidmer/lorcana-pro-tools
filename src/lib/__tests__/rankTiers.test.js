import { describe, it, expect } from 'vitest'
import { tierForMmr, ranksAtOrAbove, ranksBelow } from '../rankTiers'

describe('tierForMmr', () => {
  it('resolves the correct tier for MMR values at and between breakpoints', () => {
    expect(tierForMmr(0)).toMatchObject({ name: 'Common' })
    expect(tierForMmr(999)).toMatchObject({ name: 'Common' })
    expect(tierForMmr(1000)).toMatchObject({ name: 'Uncommon' })
    expect(tierForMmr(1449)).toMatchObject({ name: 'Super Rare' })
    expect(tierForMmr(1450)).toMatchObject({ name: 'Epic' })
    expect(tierForMmr(2500)).toMatchObject({ name: 'Iconic' })
  })
})

describe('ranksAtOrAbove', () => {
  it('returns the tier and everything above it', () => {
    expect(ranksAtOrAbove('Epic')).toEqual(['Epic', 'Legendary', 'Enchanted', 'Iconic'])
    expect(ranksAtOrAbove('Iconic')).toEqual(['Iconic'])
  })

  it('returns empty for an unknown tier name', () => {
    expect(ranksAtOrAbove('Mythic')).toEqual([])
  })
})

describe('ranksBelow', () => {
  it('returns everything under the tier', () => {
    expect(ranksBelow('Epic')).toEqual(['Common', 'Uncommon', 'Rare', 'Super Rare'])
  })

  it('returns empty for the bottom tier or an unknown name', () => {
    expect(ranksBelow('Common')).toEqual([])
    expect(ranksBelow('Mythic')).toEqual([])
  })
})

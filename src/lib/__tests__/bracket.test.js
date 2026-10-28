import { describe, it, expect } from 'vitest'
import { bracketRoundLabel } from '../bracket'

describe('bracketRoundLabel', () => {
  it('names a round by how many matches it holds', () => {
    expect(bracketRoundLabel(1, 3)).toBe('Final')
    expect(bracketRoundLabel(2, 2)).toBe('Semifinals')
    expect(bracketRoundLabel(4, 1)).toBe('Quarterfinals')
    expect(bracketRoundLabel(8, 1)).toBe('Round of 16')
    expect(bracketRoundLabel(32, 1)).toBe('Round of 64')
  })
  it('falls back to the phase name and round number for an odd match count', () => {
    expect(bracketRoundLabel(3, 2, 'Top Cut')).toBe('Top Cut · Round 2')
    expect(bracketRoundLabel(0, 1)).toBe('Bracket · Round 1')
  })
})

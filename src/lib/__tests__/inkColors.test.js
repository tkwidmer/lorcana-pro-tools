import { describe, it, expect } from 'vitest'
import { resolveInkName, resolveColors, matchupKey, VALID_INKS } from '../inkColors'

describe('resolveInkName', () => {
  it('returns canonical name for aliases', () => {
    expect(resolveInkName('red')).toBe('ruby')
    expect(resolveInkName('blue')).toBe('sapphire')
    expect(resolveInkName('green')).toBe('emerald')
    expect(resolveInkName('yellow')).toBe('amber')
    expect(resolveInkName('purple')).toBe('amethyst')
    expect(resolveInkName('gray')).toBe('steel')
    expect(resolveInkName('grey')).toBe('steel')
  })

  it('accepts canonical names as-is', () => {
    for (const ink of VALID_INKS) {
      expect(resolveInkName(ink)).toBe(ink)
    }
  })

  it('is case-insensitive', () => {
    expect(resolveInkName('RUBY')).toBe('ruby')
    expect(resolveInkName('Sapphire')).toBe('sapphire')
    expect(resolveInkName('AMBER')).toBe('amber')
  })

  it('returns null for unknown or falsy input', () => {
    expect(resolveInkName('unknown')).toBeNull()
    expect(resolveInkName('')).toBeNull()
    expect(resolveInkName(null)).toBeNull()
    expect(resolveInkName(undefined)).toBeNull()
  })
})

describe('resolveColors', () => {
  it('parses slash-separated color strings', () => {
    expect(resolveColors(['ruby/sapphire'])).toEqual(['ruby', 'sapphire'])
    expect(resolveColors(['amber/steel'])).toEqual(['amber', 'steel'])
  })

  it('handles aliases within slashes', () => {
    expect(resolveColors(['red/blue'])).toEqual(['ruby', 'sapphire'])
  })

  it('parses hyphen-separated dual-ink card colors', () => {
    expect(resolveColors(['Amber-Steel'])).toEqual(['amber', 'steel'])
    expect(resolveColors(['Ruby-Sapphire'])).toEqual(['ruby', 'sapphire'])
  })

  it('deduplicates and sorts output', () => {
    expect(resolveColors(['ruby', 'ruby', 'sapphire'])).toEqual(['ruby', 'sapphire'])
    expect(resolveColors(['steel', 'amber'])).toEqual(['amber', 'steel'])
  })

  it('handles empty/null input', () => {
    expect(resolveColors([])).toEqual([])
    expect(resolveColors(null)).toEqual([])
    expect(resolveColors(undefined)).toEqual([])
  })

  it('ignores unknown color parts', () => {
    expect(resolveColors(['ruby/bogus'])).toEqual(['ruby'])
  })
})

describe('matchupKey', () => {
  it('builds sorted+joined key', () => {
    expect(matchupKey(['ruby', 'sapphire'])).toBe('ruby+sapphire')
    expect(matchupKey(['steel', 'amber'])).toBe('amber+steel')
  })

  it('returns "unknown" for empty/null input', () => {
    expect(matchupKey([])).toBe('unknown')
    expect(matchupKey(null)).toBe('unknown')
  })
})

import { describe, it, expect } from 'vitest'
import { parseDeckList, parseDeckListToMap } from '../parseDeckList'

describe('parseDeckListToMap', () => {
  it('parses "4x Name" and "4 Name" lines into a Map of name -> count', () => {
    const map = parseDeckListToMap('4x Elsa, Snow Queen\n3 Moana - Of Motunui')
    expect(map.get('Elsa, Snow Queen')).toBe(4)
    expect(map.get('Moana - Of Motunui')).toBe(3)
    expect(map.size).toBe(2)
  })

  it('merges duplicate lines for the same card name', () => {
    const map = parseDeckListToMap('2x Maui - Hero to All\n1x Maui - Hero to All')
    expect(map.get('Maui - Hero to All')).toBe(3)
  })

  it('skips blank lines and lines that do not match the count+name format', () => {
    const map = parseDeckListToMap('\n  \nnot a valid line\n2x Mickey Mouse - True Friend\n')
    expect(map.size).toBe(1)
    expect(map.get('Mickey Mouse - True Friend')).toBe(2)
  })

  it('skips a zero count', () => {
    const map = parseDeckListToMap('0x Nothing Card')
    expect(map.size).toBe(0)
  })

  it('trims whitespace around name and line', () => {
    const map = parseDeckListToMap('  4x   Rapunzel - Gifted with Healing  \n')
    expect(map.get('Rapunzel - Gifted with Healing')).toBe(4)
  })
})

describe('parseDeckList', () => {
  it('returns an array sorted by count descending, then name ascending', () => {
    const result = parseDeckList('1x Zeta Card\n4x Alpha Card\n4x Beta Card')
    expect(result).toEqual([
      { name: 'Alpha Card', count: 4 },
      { name: 'Beta Card', count: 4 },
      { name: 'Zeta Card', count: 1 },
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(parseDeckList('')).toEqual([])
  })
})

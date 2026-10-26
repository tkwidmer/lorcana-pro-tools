import { describe, it, expect } from 'vitest'
import { splitDeckLists, inkPairField, inkPairLines } from '../fieldBreakdown'
import { buildCardIndex } from '../cardAnalysis'

const cards = [
  { fullName: 'Elsa - Snow Queen', name: 'Elsa', setCode: '1', number: 1, color: 'Amethyst', colors: ['Amethyst'] },
  { fullName: 'Mulan - Elite Archer', name: 'Mulan', setCode: '1', number: 2, color: 'Ruby', colors: ['Ruby'] },
  { fullName: 'Hamm - Piggy Bank', name: 'Hamm', setCode: '1', number: 3, color: 'Sapphire', colors: ['Sapphire'] },
]

describe('fieldBreakdown', () => {
  it('splits pasted lists on blank lines and dash rules, dropping set suffixes', () => {
    expect(splitDeckLists('4 A\n4 B\n\n4 C (1-5)\n---\n4 D\n')).toEqual(['4 A\n4 B', '4 C', '4 D'])
  })
  it('counts the field by each deck\'s two most-played inks', () => {
    const lists = ['4 Elsa - Snow Queen\n4 Mulan - Elite Archer', '4 Mulan - Elite Archer\n2 Elsa - Snow Queen\n4 Unknown Card', '4 Hamm - Piggy Bank', '4 Nobody']
    const { decks, field } = inkPairField(lists, buildCardIndex(cards))
    expect(decks[0]).toEqual({ index: 1, colors: ['amethyst', 'ruby'], cards: 8, unmatched: [] })
    expect(decks[1].unmatched).toEqual(['Unknown Card'])
    expect(field).toEqual([
      { pair: 'Amethyst/Ruby', colors: ['amethyst', 'ruby'], count: 2 },
      { pair: 'Sapphire', colors: ['sapphire'], count: 1 },
      { pair: 'Unknown', colors: [], count: 1 },
    ])
    expect(inkPairLines(lists, buildCardIndex(cards))).toEqual(['Amethyst/Ruby 2', 'Sapphire 1', 'Unknown 1'])
  })
})

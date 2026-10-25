import { describe, it, expect } from 'vitest'
import { splitDeckLists, classifyField, inkPairLines } from '../fieldBreakdown'
import { buildCardIndex } from '../cardAnalysis'

const cards = [
  { fullName: 'Elsa - Snow Queen', name: 'Elsa', setCode: '1', number: 1, color: 'Amethyst', colors: ['Amethyst'] },
  { fullName: 'Mulan - Elite Archer', name: 'Mulan', setCode: '1', number: 2, color: 'Ruby', colors: ['Ruby'] },
  { fullName: 'Hamm - Piggy Bank', name: 'Hamm', setCode: '1', number: 3, color: 'Sapphire', colors: ['Sapphire'] },
]
const stats = {
  profiles: [
    { id: 'p1', colors: ['amethyst', 'ruby'], archetypeName: 'Tempo', archetypeSlug: 'tempo', games: 100, centroidCounts: { '1-1': 4, '1-2': 4 } },
    { id: 'p2', colors: ['amethyst', 'ruby'], archetypeName: 'Other', archetypeSlug: 'other', games: 50, centroidCounts: { '1-1': 1, '1-2': 1, '9-9': 40 } },
  ],
}

describe('fieldBreakdown', () => {
  it('splits pasted lists on blank lines and dash rules, dropping set suffixes', () => {
    expect(splitDeckLists('4 A\n4 B\n\n4 C (1-5)\n---\n4 D\n')).toEqual(['4 A\n4 B', '4 C', '4 D'])
  })
  it('assigns each list to the archetype it overlaps most and counts the field', () => {
    const { decks, field } = classifyField(['4 Elsa - Snow Queen\n4 Mulan - Elite Archer', '4 Elsa - Snow Queen\n4 Mulan - Elite Archer\n4 Unknown Card', '4 Hamm - Piggy Bank'], cards, buildCardIndex(cards), stats)
    expect(decks[0]).toMatchObject({ index: 1, archetype: 'Amethyst/Ruby Tempo', colors: ['amethyst', 'ruby'], cards: 8, unmatched: [] })
    expect(decks[0].overlap).toBe(1)
    expect(decks[0].runnerUp.name).toBe('Amethyst/Ruby Other')
    expect(decks[1].unmatched).toEqual(['Unknown Card'])
    expect(decks[2].archetype).toBeNull()
    expect(field).toEqual([{ archetype: 'Amethyst/Ruby Tempo', colors: ['amethyst', 'ruby'], count: 2 }, { archetype: 'Unassigned', colors: ['sapphire'], count: 1 }])
  })
  it('counts the field by ink pair as Metagame card lines', () => {
    const lists = ['4 Elsa - Snow Queen\n4 Mulan - Elite Archer', '4 Mulan - Elite Archer\n2 Elsa - Snow Queen', '4 Hamm - Piggy Bank', '4 Nobody']
    expect(inkPairLines(lists, buildCardIndex(cards))).toEqual(['Amethyst/Ruby 2', 'Sapphire 1', 'Unknown 1'])
  })
})

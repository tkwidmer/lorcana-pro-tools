import { describe, it, expect } from 'vitest'
import { matchDeckInks, normalizeInks } from '../deckInks'

const s = (id: string, name: string) => ({ rph_player_id: id, player_name: name })

describe('normalizeInks', () => {
  it('lowercases, de-duplicates and sorts one or two valid inks', () => {
    expect(normalizeInks(['Steel', 'emerald'])).toEqual(['emerald', 'steel'])
    expect(normalizeInks(['amber', 'amber'])).toEqual(['amber'])
  })
  it('rejects anything else', () => {
    expect(normalizeInks(['amber', 'ruby', 'steel'])).toBeNull()
    expect(normalizeInks(['amber', 'purple'])).toBeNull()
    expect(normalizeInks([])).toBeNull()
    expect(normalizeInks(null)).toBeNull()
  })
})

describe('matchDeckInks', () => {
  const standings = [s('1', 'Avery'), s('2', 'JAY'), s('3', 'Jay'), s('4', 'George'), s('5', 'George'), s('6', 'Santi')]

  it('matches authors to standings by exact, case-sensitive name', () => {
    const r = matchDeckInks(standings, [
      { deck_id: 'a', author: 'Avery', inks: ['emerald', 'amber'] },
      { deck_id: 'b', author: 'JAY', inks: ['sapphire', 'amber'] },
      { deck_id: 'c', author: 'Jay', inks: ['amber', 'amethyst'] },
    ])
    expect(r.updates).toEqual([
      { playerId: '1', playerName: 'Avery', inks: ['amber', 'emerald'] },
      { playerId: '2', playerName: 'JAY', inks: ['amber', 'sapphire'] },
      { playerId: '3', playerName: 'Jay', inks: ['amber', 'amethyst'] },
    ])
  })

  it('collapses a repeated deck, but reports a name on two standings or decks that disagree', () => {
    const r = matchDeckInks(standings, [
      { deck_id: 'a', author: 'Avery', inks: ['amber', 'emerald'] },
      { deck_id: 'a', author: 'Avery', inks: ['emerald', 'amber'] },
      { deck_id: 'g', author: 'George', inks: ['emerald', 'steel'] },
      { deck_id: 's1', author: 'Santi', inks: ['emerald', 'steel'] },
      { deck_id: 's2', author: 'Santi', inks: ['amethyst', 'steel'] },
    ])
    expect(r.updates.map((u) => u.playerName)).toEqual(['Avery'])
    expect(r.ambiguous).toEqual(['George', 'Santi'])
  })

  it('reports authors not in the standings and decks without a usable author or pair', () => {
    const r = matchDeckInks(standings, [
      { deck_id: 'x', author: 'Nobody', inks: ['ruby', 'steel'] },
      { deck_id: 'y', author: 'Avery', inks: ['amber', 'ruby', 'steel'] },
      { deck_id: 'z', author: null, inks: ['amber'] },
    ])
    expect(r.updates).toEqual([])
    expect(r.unmatched).toEqual(['Nobody'])
    expect(r.invalid).toEqual(['Avery', 'deck z'])
  })
})

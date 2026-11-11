import { describe, it, expect } from 'vitest'
import { cardMetaRows, cardPairLift } from '../cardMetaStats'

const stats = {
  activity: { totalGames: 1000 },
  profiles: [
    { id: 'a1', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 600, wins: 330,
      centroidCounts: { '9-40': 4, '1-5': 2 }, cardLift: [{ cardId: '9-40', lift: 3.2, winRateWith: 56.1, presence: 0.9 }] },
    { id: 'a2', colors: ['amber', 'amethyst'], archetypeName: 'Midrange', gamesPlayed: 100, wins: 50,
      centroidCounts: { '1-5': 4 }, cardLift: [] },
    { id: 'b', colors: ['amber', 'emerald'], archetypeName: 'Princess Aggro', gamesPlayed: 300, wins: 180,
      centroidCounts: {}, cardLift: [{ cardId: '1-42', lift: -1.5, winRateWith: 48, presence: 0.2 }] },
    { id: 'c', colors: ['amethyst', 'ruby'], archetypeName: 'Peter Pan', gamesPlayed: 150, wins: 60, centroidCounts: { '1-5': 1 } },
    { id: 'd', colors: ['steel', 'ruby'], archetypeName: null, gamesPlayed: 1000, wins: 500, centroidCounts: { '1-42': 4 } },
  ],
  pairCardLift: {
    'amber/amethyst': [{ cardId: '9-40', lift: 2.0, winRateWith: 55, presence: 0.8 }],
    'amber/emerald': [{ cardId: '1-42', lift: -0.5, winRateWith: 49, presence: 0.1 }],
  },
}
// Elsa's ids across printings: set 1 and the set 9 reprint.
const elsaIds = ['1-42', '9-40']

describe('cardMetaRows', () => {
  it('one row per named archetype whose average build or lift list names any of the card ids', () => {
    const rows = cardMetaRows(stats, elsaIds)
    expect(rows.map(r => [r.name, r.copies, r.lift])).toEqual([
      ['Amber/Amethyst Midrange', 4, 3.2],
      ['Amber/Emerald Princess Aggro', 0, -1.5],
    ])
    expect(rows[0]).toMatchObject({ gamesPlayed: 700, winRate: 54.29, metaShare: 35, presence: 0.9, winRateWith: 56.1, colors: ['amber', 'amethyst'] })
    expect(rows[1]).toMatchObject({ presence: 0.2, winRateWith: 48 })
  })

  it('uses the most-played variant\'s build, and leaves lift null when only the centroid names the card', () => {
    const rows = cardMetaRows(stats, ['1-5'])
    expect(rows.map(r => [r.name, r.copies, r.lift])).toEqual([
      ['Amber/Amethyst Midrange', 2, null],
      ['Amethyst/Ruby Peter Pan', 1, null],
    ])
  })

  it('ignores uncurated profiles and tolerates missing fields', () => {
    expect(cardMetaRows({ profiles: [{ id: 'x', colors: ['steel'], archetypeName: null, gamesPlayed: 5, wins: 2, centroidCounts: { '1-42': 4 } }] }, ['1-42'])).toEqual([])
    expect(cardMetaRows({}, ['1-42'])).toEqual([])
    expect(cardMetaRows(null, ['1-42'])).toEqual([])
  })
})

describe('cardPairLift', () => {
  it('collects every colour pair lift entry for the card, best lift first', () => {
    expect(cardPairLift(stats, elsaIds)).toEqual([
      { pair: 'amber/amethyst', presence: 0.8, winRateWith: 55, lift: 2.0 },
      { pair: 'amber/emerald', presence: 0.1, winRateWith: 49, lift: -0.5 },
    ])
    expect(cardPairLift({}, elsaIds)).toEqual([])
  })
})

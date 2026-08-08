import { describe, it, expect } from 'vitest'
import { buildDirectory } from '../opponentDirectory'

const makeCard = (name, overrides = {}) => ({
  name, id: `1-${name.length}`,
  drawn: 0, played: 0, inked: 0, discarded: 0, destroyed: 0,
  ...overrides,
})

const makeGame = (overrides = {}) => ({
  p1Name: 'You', p2Name: 'Rival',
  myPlayerNum: 1,
  winner: 1,
  oppInkCombo: ['ruby'],
  playedAt: 1000,
  p2: { cardList: [] },
  p1: { cardList: [] },
  ...overrides,
})

describe('buildDirectory', () => {
  it('returns nothing for games with no myPlayerNum', () => {
    const result = buildDirectory([makeGame({ myPlayerNum: null })])
    expect(result).toEqual([])
  })

  it('skips games where the opponent name is missing or a placeholder', () => {
    const result = buildDirectory([
      makeGame({ p2Name: null }),
      makeGame({ p2Name: 'Player 2' }),
    ])
    expect(result).toEqual([])
  })

  it('picks the correct opponent seat based on myPlayerNum', () => {
    const result = buildDirectory([
      makeGame({ myPlayerNum: 2, p1Name: 'Rival', p2Name: 'You', winner: 2 }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Rival')
  })

  it('aggregates game count and win/loss record across multiple games', () => {
    const result = buildDirectory([
      makeGame({ winner: 1 }), // win
      makeGame({ winner: 2 }), // loss
      makeGame({ winner: 1 }), // win
    ])
    expect(result).toHaveLength(1)
    expect(result[0].gameCount).toBe(3)
    expect(result[0].wins).toBe(2)
    expect(result[0].losses).toBe(1)
    expect(result[0].winRate).toBeCloseTo((2 / 3) * 100)
  })

  it('tracks the most recent playedAt across games', () => {
    const result = buildDirectory([
      makeGame({ playedAt: 1000 }),
      makeGame({ playedAt: 5000 }),
      makeGame({ playedAt: 2000 }),
    ])
    expect(result[0].lastPlayed).toBe(5000)
  })

  it('buckets games by opponent ink colors into separate decks', () => {
    const result = buildDirectory([
      makeGame({ oppInkCombo: ['ruby'] }),
      makeGame({ oppInkCombo: ['ruby', 'sapphire'] }),
      makeGame({ oppInkCombo: ['ruby'] }),
    ])
    expect(result[0].decks).toHaveLength(2)
    const rubyOnly = result[0].decks.find(d => d.colors.length === 1)
    const rubySapphire = result[0].decks.find(d => d.colors.length === 2)
    expect(rubyOnly.gameCount).toBe(2)
    expect(rubySapphire.gameCount).toBe(1)
    expect(result[0].allColors.sort()).toEqual(['ruby', 'sapphire'])
  })

  it('sums played/inked/discarded/destroyed counts for cards observed against us', () => {
    const result = buildDirectory([
      makeGame({
        p2: { cardList: [makeCard('Elsa - Snow Queen', { played: 1, inked: 0 })] },
      }),
      makeGame({
        p2: { cardList: [makeCard('Elsa - Snow Queen', { played: 0, inked: 1, discarded: 1 })] },
      }),
    ])
    const [card] = result[0].decks[0].cards
    expect(card.name).toBe('Elsa - Snow Queen')
    expect(card.played).toBe(1)
    expect(card.inked).toBe(1)
    expect(card.discarded).toBe(1)
    expect(card.destroyed).toBe(0)
    expect(card.seenIn).toBe(2)
  })

  it('excludes cards with no observed activity', () => {
    const result = buildDirectory([
      makeGame({
        p2: { cardList: [makeCard('Untouched Card'), makeCard('Played Card', { played: 1 })] },
      }),
    ])
    const names = result[0].decks[0].cards.map(c => c.name)
    expect(names).toEqual(['Played Card'])
  })

  it('sorts cards within a deck by total observed activity descending', () => {
    const result = buildDirectory([
      makeGame({
        p2: {
          cardList: [
            makeCard('Low Activity', { played: 1 }),
            makeCard('High Activity', { played: 2, inked: 2 }),
          ],
        },
      }),
    ])
    const names = result[0].decks[0].cards.map(c => c.name)
    expect(names).toEqual(['High Activity', 'Low Activity'])
  })

  it('sorts opponents by game count descending', () => {
    const result = buildDirectory([
      makeGame({ p2Name: 'Rare Opponent' }),
      makeGame({ p2Name: 'Frequent Opponent' }),
      makeGame({ p2Name: 'Frequent Opponent' }),
    ])
    expect(result.map(o => o.name)).toEqual(['Frequent Opponent', 'Rare Opponent'])
  })
})

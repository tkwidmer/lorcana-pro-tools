import { describe, it, expect } from 'vitest'
import { computeCardImpact } from '../cardImpact'

const cardList = (names) => names.map(name => ({ name, drawn: 1, played: 1, inked: 0 }))

const makeGame = (myPlayerNum, won, myCardNames) => ({
  myPlayerNum,
  winner: won ? myPlayerNum : (myPlayerNum === 1 ? 2 : 1),
  p1: myPlayerNum === 1 ? { cardList: cardList(myCardNames) } : { cardList: [] },
  p2: myPlayerNum === 2 ? { cardList: cardList(myCardNames) } : { cardList: [] },
})

describe('computeCardImpact', () => {
  it('returns empty results for no games', () => {
    const { results, totalGames } = computeCardImpact([])
    expect(results).toEqual([])
    expect(totalGames).toBe(0)
  })

  it('ignores games without myPlayerNum or winner', () => {
    const games = [
      { myPlayerNum: null, winner: 1, p1: { cardList: [] } },
      { myPlayerNum: 1, winner: null, p1: { cardList: [] } },
    ]
    const { totalGames } = computeCardImpact(games)
    expect(totalGames).toBe(0)
  })

  it('credits a card that correlates with winning', () => {
    const games = [
      makeGame(1, true, ['Mickey Mouse - Brave Little Tailor']),
      makeGame(1, true, ['Mickey Mouse - Brave Little Tailor']),
      makeGame(1, false, []),
      makeGame(1, false, []),
    ]
    const { results } = computeCardImpact(games)
    const mickey = results.find(r => r.name === 'Mickey Mouse - Brave Little Tailor')
    expect(mickey.gamesWith).toBe(2)
    expect(mickey.winsWith).toBe(2)
    expect(mickey.gamesWithout).toBe(2)
    expect(mickey.winsWithout).toBe(0)
    expect(mickey.winRateWith).toBe(1)
    expect(mickey.winRateWithout).toBe(0)
    expect(mickey.war).toBe(2)
    expect(mickey.delta).toBe(1)
    expect(mickey.lowSample).toBe(true)
  })

  it('flags low sample sizes and sorts by war descending', () => {
    const games = [
      makeGame(1, true, ['Good Card']),
      makeGame(1, false, ['Bad Card']),
    ]
    const { results } = computeCardImpact(games)
    expect(results.every(r => r.lowSample)).toBe(true)
    expect(results[0].war).toBeGreaterThanOrEqual(results[results.length - 1].war)
  })
})

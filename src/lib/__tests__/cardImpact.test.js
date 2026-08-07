import { describe, it, expect } from 'vitest'
import { computeCardImpact } from '../cardImpact'

const cardId = (name) => `id-${name}`

const cardList = (names) => names.map(name => ({ name, id: cardId(name), drawn: 1, played: 1, inked: 0 }))

const makeGame = (myPlayerNum, won, myCardNames, yourDecklist = null) => ({
  myPlayerNum,
  winner: won ? myPlayerNum : (myPlayerNum === 1 ? 2 : 1),
  yourDecklist,
  p1: myPlayerNum === 1 ? { cardList: cardList(myCardNames) } : { cardList: [] },
  p2: myPlayerNum === 2 ? { cardList: cardList(myCardNames) } : { cardList: [] },
})

const MICKEY = 'Mickey Mouse - Brave Little Tailor'

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

  it('credits a card that correlates with winning, using the decklist to confirm misses', () => {
    const inDeck = [{ cardId: cardId(MICKEY), count: 1 }]
    const games = [
      makeGame(1, true, [MICKEY]),
      makeGame(1, true, [MICKEY]),
      makeGame(1, false, [], inDeck),
      makeGame(1, false, [], inDeck),
    ]
    const { results } = computeCardImpact(games)
    const mickey = results.find(r => r.name === MICKEY)
    expect(mickey.gamesWith).toBe(2)
    expect(mickey.winsWith).toBe(2)
    expect(mickey.gamesWithout).toBe(2)
    expect(mickey.winsWithout).toBe(0)
    expect(mickey.gamesNotInDeck).toBe(0)
    expect(mickey.gamesUnknown).toBe(0)
    expect(mickey.winRateWith).toBe(1)
    expect(mickey.winRateWithout).toBe(0)
    expect(mickey.war).toBe(2)
    expect(mickey.delta).toBe(1)
    expect(mickey.lowSample).toBe(true)
  })

  it('excludes a miss from the baseline when the recorded decklist confirms the card was cut', () => {
    const cutFromDeck = [{ cardId: 'some-other-card', count: 1 }]
    const games = [
      makeGame(1, true, [MICKEY]),
      makeGame(1, false, [], cutFromDeck),
      makeGame(1, false, [], cutFromDeck),
    ]
    const { results } = computeCardImpact(games)
    const mickey = results.find(r => r.name === MICKEY)
    expect(mickey.gamesWith).toBe(1)
    expect(mickey.gamesWithout).toBe(0)
    expect(mickey.gamesNotInDeck).toBe(2)
    expect(mickey.gamesUnknown).toBe(0)
    // No "without" sample means no baseline to compare against.
    expect(mickey.winRateWithout).toBeNull()
    expect(mickey.war).toBeNull()
  })

  it('treats a miss with no recorded decklist as unknown rather than counting it against the card', () => {
    const games = [
      makeGame(1, true, [MICKEY]),
      makeGame(1, false, []), // no yourDecklist recorded for this game
    ]
    const { results } = computeCardImpact(games)
    const mickey = results.find(r => r.name === MICKEY)
    expect(mickey.gamesWith).toBe(1)
    expect(mickey.gamesWithout).toBe(0)
    expect(mickey.gamesNotInDeck).toBe(0)
    expect(mickey.gamesUnknown).toBe(1)
    expect(mickey.war).toBeNull()
  })

  it('flags low sample sizes and sorts by war descending', () => {
    const inDeck = [{ cardId: cardId('Good Card'), count: 1 }, { cardId: cardId('Bad Card'), count: 1 }]
    const games = [
      makeGame(1, true, ['Good Card'], inDeck),
      makeGame(1, false, ['Bad Card'], inDeck),
    ]
    const { results } = computeCardImpact(games)
    expect(results.every(r => r.lowSample)).toBe(true)
    expect(results[0].war).toBeGreaterThanOrEqual(results[results.length - 1].war)
  })
})

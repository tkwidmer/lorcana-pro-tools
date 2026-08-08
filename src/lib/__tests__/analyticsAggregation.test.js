import { describe, it, expect } from 'vitest'
import {
  replayViewerUrl,
  getMyPlayerNum,
  enrichGame,
  aggregateMyCards,
  aggregateMulliganSentBack,
  aggregateMulliganWinRates,
} from '../analyticsAggregation'

describe('replayViewerUrl', () => {
  it('returns null for a falsy url', () => {
    expect(replayViewerUrl(null)).toBeNull()
    expect(replayViewerUrl('')).toBeNull()
  })

  it('rewrites a url containing a replay uuid to the duels.ink viewer', () => {
    const uuid = '12345678-1234-1234-1234-123456789abc'
    expect(replayViewerUrl(`https://example.com/replay/${uuid}`)).toBe(`https://duels.ink/replay/${uuid}`)
  })

  it('returns the original url unchanged if no uuid is found', () => {
    expect(replayViewerUrl('https://example.com/no-id-here')).toBe('https://example.com/no-id-here')
  })
})

describe('getMyPlayerNum', () => {
  const gamelog = { p1Name: 'Alice', p2Name: 'Bob the Builder' }

  it('returns null when myName is blank', () => {
    expect(getMyPlayerNum(gamelog, '')).toBeNull()
    expect(getMyPlayerNum(gamelog, '   ')).toBeNull()
    expect(getMyPlayerNum(gamelog, null)).toBeNull()
  })

  it('matches exact names case-insensitively', () => {
    expect(getMyPlayerNum(gamelog, 'alice')).toBe(1)
    expect(getMyPlayerNum(gamelog, 'BOB THE BUILDER')).toBe(2)
  })

  it('falls back to a substring match', () => {
    expect(getMyPlayerNum(gamelog, 'Bob')).toBe(2)
  })

  it('returns null when no player matches', () => {
    expect(getMyPlayerNum(gamelog, 'Charlie')).toBeNull()
  })
})

describe('enrichGame', () => {
  const baseGamelog = {
    p1Name: 'Alice',
    p2Name: 'Bob',
    winner: 1,
    wentFirst: 1,
    p1: {
      cards: { 'Elsa - Snow Queen': { id: 'c1', played: 2, inked: 1 } },
      initialHand: [{ name: 'Elsa - Snow Queen' }],
      mulliganSent: [{ name: 'Mickey Mouse' }],
      mulliganKept: [{ name: 'Elsa - Snow Queen' }],
      mulliganDrawn: [{ name: 'Goofy' }],
    },
    p2: { cards: {} },
  }

  it('returns null when the player cannot be identified', () => {
    expect(enrichGame(baseGamelog, 'Nobody')).toBeNull()
  })

  it('resolves my side, opponent, and win/mulligan data using myPlayerNum from name match', () => {
    const enriched = enrichGame(baseGamelog, 'Alice')
    expect(enriched.myPlayerNum).toBe(1)
    expect(enriched.opponentName).toBe('Bob')
    expect(enriched.won).toBe(true)
    expect(enriched.wentFirst).toBe(true)
    expect(enriched.myCards['Elsa - Snow Queen']).toMatchObject({ playedCount: 2, inkedCount: 1 })
    expect(enriched.mulligan.tookMulligan).toBe(true)
    expect(enriched.mulligan.sentBack).toEqual([{ name: 'Mickey Mouse', fullName: 'Mickey Mouse' }])
  })

  it('prefers a stored myPlayerNum over name matching', () => {
    const enriched = enrichGame({ ...baseGamelog, myPlayerNum: 2 }, 'Alice')
    expect(enriched.myPlayerNum).toBe(2)
    expect(enriched.opponentName).toBe('Alice')
    expect(enriched.won).toBe(false)
  })
})

describe('aggregateMyCards', () => {
  it('sums card stats across games', () => {
    const games = [
      { myCards: { A: { fullName: 'A', playedCount: 1, inkedCount: 0, loreGained: 2, effectDraws: 0, oppForcedDiscards: 0, extraInks: 0, effectRemovals: 0 } } },
      { myCards: { A: { fullName: 'A', playedCount: 2, inkedCount: 1, loreGained: 3, effectDraws: 0, oppForcedDiscards: 0, extraInks: 0, effectRemovals: 0 } } },
    ]
    const result = aggregateMyCards(games)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ fullName: 'A', playedCount: 3, inkedCount: 1, loreGained: 5 })
  })

  it('returns an empty array for no games', () => {
    expect(aggregateMyCards([])).toEqual([])
  })
})

describe('aggregateMulliganSentBack', () => {
  it('counts a card as sent back only when all copies in the opening hand were sent back', () => {
    const games = [
      { mulligan: { openingHand: [{ fullName: 'A' }, { fullName: 'A' }], sentBack: [{ fullName: 'A' }] } },
      { mulligan: { openingHand: [{ fullName: 'A' }], sentBack: [{ fullName: 'A' }] } },
    ]
    const result = aggregateMulliganSentBack(games)
    const a = result.find(r => r.fullName === 'A')
    expect(a.openingHandCount).toBe(2)
    expect(a.sentBackCount).toBe(1)
  })
})

describe('aggregateMulliganWinRates', () => {
  it('tallies wins/losses per card by kept vs sent status, counting games not copies', () => {
    const games = [
      { won: true, mulligan: { kept: [{ fullName: 'A' }], sentBack: [] } },
      { won: false, mulligan: { kept: [], sentBack: [{ fullName: 'A' }] } },
    ]
    const result = aggregateMulliganWinRates(games)
    const a = result.find(r => r.fullName === 'A')
    expect(a).toEqual({ fullName: 'A', keptWins: 1, keptLosses: 0, sentWins: 0, sentLosses: 1 })
  })
})


import { describe, it, expect } from 'vitest'
import { listPlayers, buildPlayerProfile } from '../playerProfiles'

const makeRecord = ({ game: gameOverrides, ...overrides } = {}) => ({
  uuid: 'r1',
  lastUpdated: 1000,
  game: {
    p1Name: 'Someone Else',
    p2Name: 'Rival',
    p1InkColors: ['amber'],
    p2InkColors: ['ruby'],
    winner: 1,
    currentTurn: 4,
    p1Lore: 20,
    p2Lore: 10,
    log: [],
    p1ObservedDeck: [],
    p2ObservedDeck: [],
    ...gameOverrides,
  },
  ...overrides,
})

const makeGamelogCard = (name, overrides = {}) => ({
  name, played: 0, inked: 0, discarded: 0, destroyed: 0, ...overrides,
})

const makeGamelog = (overrides = {}) => ({
  p1Name: 'Someone Else',
  p2Name: 'Rival',
  myPlayerNum: 1,
  winner: 1,
  oppInkCombo: ['ruby'],
  playedAt: 2000,
  p2: { cardList: [] },
  p1: { cardList: [] },
  ...overrides,
})

describe('listPlayers', () => {
  it('lists scouted-only players with zero gamelog count', () => {
    const p = listPlayers([makeRecord()], []).find(p => p.name === 'Rival')
    expect(p.games).toBe(1)
    expect(p.scoutedGameCount).toBe(1)
    expect(p.gamelogGameCount).toBe(0)
  })

  it('lists gamelog-only players with zero scouted count', () => {
    const p = listPlayers([], [makeGamelog()]).find(p => p.name === 'Rival')
    expect(p.games).toBe(1)
    expect(p.scoutedGameCount).toBe(0)
    expect(p.gamelogGameCount).toBe(1)
  })

  it('merges the same opponent name across both sources, flipping gamelog W/L to this player\'s own record', () => {
    // Scouted: 2 records, Rival (p2) loses both (winner: 1) -> 0-2.
    // Gamelog: I win one (winner: 1, Rival loses) and lose one (winner: 2,
    // Rival wins) -> from Rival's own perspective that's 1-1.
    const p = listPlayers(
      [makeRecord(), makeRecord({ uuid: 'r2' })],
      [makeGamelog(), makeGamelog({ winner: 2 })]
    ).find(p => p.name === 'Rival')
    expect(p.games).toBe(4)
    expect(p.scoutedGameCount).toBe(2)
    expect(p.gamelogGameCount).toBe(2)
    expect(p.wins).toBe(1)
    expect(p.losses).toBe(3)
  })

  it('unions deck keys across sources into deckCount', () => {
    const p = listPlayers(
      [makeRecord()], // Rival plays ruby (scouted)
      [makeGamelog({ oppInkCombo: ['sapphire'] })] // Rival plays sapphire (gamelog)
    ).find(p => p.name === 'Rival')
    expect(p.deckCount).toBe(2)
  })
})

describe('buildPlayerProfile', () => {
  it('returns null when the name has no games in either source', () => {
    expect(buildPlayerProfile([], [], 'Nobody')).toBeNull()
  })

  it('builds a scouted-only profile identical in shape to before', () => {
    const profile = buildPlayerProfile([makeRecord()], [], 'Rival')
    expect(profile.gameCount).toBe(1)
    expect(profile.scoutedGameCount).toBe(1)
    expect(profile.gamelogGameCount).toBe(0)
    expect(profile.decks).toHaveLength(1)
    expect(profile.decks[0].hasScoutedData).toBe(true)
    expect(profile.decks[0].hasGamelogData).toBe(false)
    expect(profile.decks[0].games).toHaveLength(1)
  })

  it('builds a gamelog-only profile with no scouted games list', () => {
    const profile = buildPlayerProfile([], [makeGamelog()], 'Rival')
    expect(profile.gameCount).toBe(1)
    expect(profile.scoutedGameCount).toBe(0)
    expect(profile.gamelogGameCount).toBe(1)
    expect(profile.decks[0].hasScoutedData).toBe(false)
    expect(profile.decks[0].hasGamelogData).toBe(true)
    expect(profile.decks[0].games).toEqual([])
  })

  it('merges a deck seen in both sources into one bucket, summing games and combining card stats', () => {
    const scoutedCard = { name: 'Elsa - Snow Queen', plays: 2, inked: 1 }
    const record = makeRecord({
      game: { p2ObservedDeck: [scoutedCard] },
    })
    const gamelog = makeGamelog({
      p2: { cardList: [makeGamelogCard('Elsa - Snow Queen', { played: 3, discarded: 1 })] },
    })

    const profile = buildPlayerProfile([record], [gamelog], 'Rival')
    expect(profile.decks).toHaveLength(1) // both are ruby -> same deckKey
    const deck = profile.decks[0]
    expect(deck.hasScoutedData).toBe(true)
    expect(deck.hasGamelogData).toBe(true)
    expect(deck.gameCount).toBe(2)
    expect(deck.scoutedGameCount).toBe(1)
    expect(deck.gamelogGameCount).toBe(1)

    const card = deck.cards.find(c => c.name === 'Elsa - Snow Queen')
    expect(card.plays).toBe(2)
    expect(card.inks).toBe(1)
    expect(card.played).toBe(3)
    expect(card.discarded).toBe(1)
    expect(card.seenIn).toBe(2) // 1 scouted + 1 gamelog
  })

  it('keeps decks from different ink combos as separate buckets even when merged', () => {
    const record = makeRecord() // opponent ruby
    const gamelog = makeGamelog({ oppInkCombo: ['sapphire'] })
    const profile = buildPlayerProfile([record], [gamelog], 'Rival')
    expect(profile.decks).toHaveLength(2)
  })

  it('keeps zero-value scouted play-pattern stats for a gamelog-only deck', () => {
    const profile = buildPlayerProfile([], [makeGamelog()], 'Rival')
    const deck = profile.decks[0]
    expect(deck.questsPerTurn).toBe(0)
    expect(deck.inkRate).toBe(0)
  })
})

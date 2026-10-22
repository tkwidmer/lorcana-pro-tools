import { describe, it, expect } from 'vitest'
import {
  MIN_ARCHETYPE_OVERLAP, countsFromDecklist, constructedDecks, deckVersions, archetypeCandidates, assignArchetype,
  diffBuild, liftChecklist, archetypeVsColorPairs, colorPairField, personalMatchups, matchupTable, defaultQueueFor,
  deckDoctorVerdict,
} from '../deckDoctor'
import { matchupKey } from '../inkColors'

const list = (pairs) => pairs.map(([cardId, count]) => ({ cardId, count }))
const game = (over = {}) => ({
  your_deck_id: 'd1', your_deck_colors: 'amber/emerald', your_decklist: list([['1-1', 4], ['1-2', 4]]),
  result: 'win', opp_deck_colors: 'ruby/sapphire', queue_id: 'q', queue_name: 'Core Set 14 BO1', started_at: '2026-10-10T10:00:00Z',
  ...over,
})
const profile = (over = {}) => ({
  id: 'p1', colors: ['amber', 'emerald'], archetypeName: 'Circle of Life', gamesPlayed: 1000, wins: 540, sampleCount: 100,
  centroidCounts: { '1-1': 4, '1-2': 4, '1-3': 2 },
  cardLift: [
    { cardId: '1-3', lift: 1.2, presence: 0.3 },
    { cardId: '1-9', lift: 0.8, presence: 0.2 },
    { cardId: '1-2', lift: -0.9, presence: 0.9 },
  ],
  ...over,
})

describe('countsFromDecklist', () => {
  it('maps ids to counts and ignores null', () => {
    expect([...countsFromDecklist(list([['1-1', 4], ['1-2', 2]]))]).toEqual([['1-1', 4], ['1-2', 2]])
    expect(countsFromDecklist(null).size).toBe(0)
  })
})

describe('constructedDecks', () => {
  it('groups by deck id, names from the map, excludes sealed and draft, counts only wins and losses', () => {
    const games = [
      game(), game({ result: 'loss' }), game({ result: 'draw' }), game({ result: 'abandoned' }),
      game({ your_deck_id: null, your_decklist: list([['2-1', 4]]), your_deck_colors: 'ruby/steel' }),
      game({ your_deck_id: 's', queue_name: 'Sealed' }), game({ your_deck_id: 'dr', queue_id: 'draft-x' }),
    ]
    const decks = constructedDecks(games, { d1: 'Max Goof' })
    expect(decks.map((d) => d.name)).toEqual(['Max Goof', 'Ruby/Steel'])
    expect(decks[0]).toMatchObject({ key: 'd1', deckId: 'd1', colors: ['amber', 'emerald'], queueName: 'Core Set 14 BO1', games: 2, wins: 1, losses: 1 })
    expect(decks[1].deckId).toBeNull()
    expect(decks[1].key).toBeTruthy()
  })
  it('skips games without a decklist', () => {
    expect(constructedDecks([game({ your_deck_id: null, your_decklist: null })], {})).toEqual([])
  })
})

describe('deckVersions', () => {
  it('groups a deck by list fingerprint, newest first, with a diff from the latest list', () => {
    const old = list([['1-1', 4], ['1-3', 4]])
    const games = [
      game({ started_at: '2026-10-12T10:00:00Z' }),
      game({ started_at: '2026-10-01T10:00:00Z', your_decklist: old, result: 'loss' }),
      game({ started_at: '2026-10-02T10:00:00Z', your_decklist: old }),
    ]
    const v = deckVersions(games)
    expect(v).toHaveLength(2)
    expect(v[0]).toMatchObject({ games: 1, wins: 1, losses: 0, firstAt: '2026-10-12T10:00:00Z' })
    expect(v[0].diffFromLatest).toEqual({ onlyMine: [], onlyField: [], countDiffs: [] })
    expect(v[1]).toMatchObject({ games: 2, wins: 1, losses: 1, firstAt: '2026-10-01T10:00:00Z', lastAt: '2026-10-02T10:00:00Z' })
    expect(v[1].diffFromLatest.onlyMine).toEqual([{ cardId: '1-3', mine: 4 }])
    expect(v[1].diffFromLatest.onlyField).toEqual([{ cardId: '1-2', field: 4 }])
  })
})

describe('archetype assignment', () => {
  const stats = { profiles: [profile(), profile({ id: 'p2', archetypeName: 'Songs', centroidCounts: { '1-1': 4, '9-9': 4 } }), profile({ id: 'p3', colors: ['ruby', 'sapphire'], archetypeName: 'Pawpsicle' })] }
  const mine = countsFromDecklist(list([['1-1', 4], ['1-2', 4], ['1-4', 2]]))
  it('ranks same-colour archetypes by overlap and picks the best', () => {
    const c = archetypeCandidates(stats, ['emerald', 'amber'], mine)
    expect(c.map((x) => x.archetype.archetypeName)).toEqual(['Circle of Life', 'Songs'])
    expect(c[0]).toMatchObject({ shared: 8, total: 10, overlap: 0.8 })
    expect(assignArchetype(stats, ['amber', 'emerald'], mine).key).toBe(c[0].key)
  })
  it('returns null below the overlap floor and with no same-colour archetype', () => {
    expect(MIN_ARCHETYPE_OVERLAP).toBe(0.5)
    expect(assignArchetype(stats, ['amber', 'emerald'], countsFromDecklist(list([['7-7', 4], ['7-8', 4]])))).toBeNull()
    expect(assignArchetype(stats, ['steel', 'sapphire'], mine)).toBeNull()
    expect(archetypeCandidates({ profiles: [] }, ['amber', 'emerald'], mine)).toEqual([])
    expect(archetypeCandidates({}, ['amber', 'emerald'], mine)).toEqual([])
  })
})

describe('diffBuild', () => {
  const mine = countsFromDecklist(list([['1-1', 4], ['1-2', 2], ['1-5', 1]]))
  it('separates only-mine, only-field and count differences', () => {
    expect(diffBuild(mine, { '1-1': 4, '1-2': 4, '1-3': 2 })).toEqual({
      onlyMine: [{ cardId: '1-5', mine: 1 }],
      onlyField: [{ cardId: '1-3', field: 2 }],
      countDiffs: [{ cardId: '1-2', mine: 2, field: 4 }],
    })
  })
  it('is empty for identical lists and tolerates a null centroid', () => {
    expect(diffBuild(mine, { '1-1': 4, '1-2': 2, '1-5': 1 })).toEqual({ onlyMine: [], onlyField: [], countDiffs: [] })
    expect(diffBuild(mine, null).onlyMine).toHaveLength(3)
  })
})

describe('liftChecklist', () => {
  const mine = countsFromDecklist(list([['1-2', 4], ['1-9', 1], ['1-7', 2]]))
  it('flags missing positive-lift and present negative-lift cards, sorted by lift', () => {
    const rows = liftChecklist([
      { cardId: '1-3', lift: 1.2, presence: 0.3 }, { cardId: '1-9', lift: 0.8, presence: 0.2 },
      { cardId: '1-2', lift: -0.9, presence: 0.9 }, { cardId: '1-7', lift: -0.1, presence: 0.5 },
    ], mine)
    expect(rows.map((r) => [r.cardId, r.mine, r.flag])).toEqual([
      ['1-3', 0, 'missing-positive'], ['1-9', 1, null], ['1-7', 2, 'present-negative'], ['1-2', 4, 'present-negative'],
    ])
  })
  it('returns [] for a null or empty list', () => {
    expect(liftChecklist(null, mine)).toEqual([])
    expect(liftChecklist(undefined, mine)).toEqual([])
  })
})

describe('archetypeVsColorPairs', () => {
  const stats = {
    profiles: [profile(), profile({ id: 'p1b' }), profile({ id: 'p3', colors: ['ruby', 'sapphire'], archetypeName: 'Pawpsicle' }), profile({ id: 'p4', colors: ['steel', 'sapphire'], archetypeName: 'Items' })],
    archetypeMatchups: [
      { archetypeIdA: 'p1', archetypeIdB: 'p3', games: 100, winsA: 60 },
      { archetypeIdA: 'p3', archetypeIdB: 'p1b', games: 50, winsA: 20 },   // mirrored: our wins = 30
      { archetypeIdA: 'p4', archetypeIdB: 'p1', games: 10, winsA: 7 },
      { archetypeIdA: 'p3', archetypeIdB: 'p4', games: 999, winsA: 1 },    // not ours
    ],
  }
  it('rolls both directions up to the opponent colour pair across all variants', () => {
    const key = assignArchetype(stats, ['amber', 'emerald'], countsFromDecklist(list([['1-1', 4], ['1-2', 4]]))).key
    const m = archetypeVsColorPairs(stats, key)
    expect(m.get(matchupKey(['ruby', 'sapphire']))).toEqual({ games: 150, wins: 90, winRate: 60 })
    expect(m.get(matchupKey(['sapphire', 'steel']))).toEqual({ games: 10, wins: 3, winRate: 30 })
    expect(m.size).toBe(2)
  })
  it('is empty without archetypeMatchups', () => {
    expect(archetypeVsColorPairs({ profiles: [profile()] }, 'x').size).toBe(0)
  })
})

describe('colorPairField', () => {
  it('reads stats.matchups in either direction', () => {
    const stats = { matchups: [
      { colorsA: ['amber', 'emerald'], colorsB: ['ruby', 'sapphire'], games: 200, winRate: 55 },
      { colorsA: ['steel', 'sapphire'], colorsB: ['amber', 'emerald'], games: 80, winRate: 40 },
    ] }
    const m = colorPairField(stats, ['amber', 'emerald'])
    expect(m.get(matchupKey(['ruby', 'sapphire']))).toEqual({ games: 200, winRate: 55 })
    expect(m.get(matchupKey(['sapphire', 'steel']))).toEqual({ games: 80, winRate: 60 })
  })
})

describe('personalMatchups', () => {
  it('counts wins and losses per opponent pair, skipping draws, abandoned and 3-ink opponents', () => {
    const m = personalMatchups([
      game(), game({ result: 'loss' }), game({ result: 'draw' }), game({ result: 'abandoned' }),
      game({ opp_deck_colors: 'amber/ruby/steel' }), game({ opp_deck_colors: null }),
    ])
    expect(m.get(matchupKey(['ruby', 'sapphire']))).toEqual({ games: 2, wins: 1, losses: 1 })
    expect(m.size).toBe(1)
  })
})

describe('matchupTable', () => {
  it('joins personal to field, shrinks toward the field rate, and marks only significant gaps', () => {
    const rs = matchupKey(['ruby', 'sapphire'])
    const ss = matchupKey(['sapphire', 'steel'])
    const personal = new Map([[rs, { games: 40, wins: 8, losses: 32 }], [ss, { games: 3, wins: 3, losses: 0 }]])
    const field = new Map([[rs, { games: 1000, wins: 550, winRate: 55 }], [ss, { games: 500, wins: 250, winRate: 50 }]])
    const rows = matchupTable(personal, field)
    expect(rows.map((r) => r.oppKey)).toEqual([rs, ss])
    expect(rows[0]).toMatchObject({ games: 40, wins: 8, losses: 32, fieldWinRate: 55, significant: true })
    expect(rows[0].shrunkWinRate).toBeCloseTo(((8 + 0.55 * 10) / 50) * 100, 5)
    expect(rows[0].gap).toBeLessThan(0)
    expect(rows[1]).toMatchObject({ games: 3, significant: false, belowMin: true })
  })
  it('keeps a personal row with no field data, with nulls', () => {
    const k = matchupKey(['amber', 'steel'])
    const [row] = matchupTable(new Map([[k, { games: 6, wins: 3, losses: 3 }]]), new Map())
    expect(row).toMatchObject({ fieldWinRate: null, gap: null, significant: false })
    expect(row.shrunkWinRate).toBe(50)
  })
})

describe('defaultQueueFor', () => {
  it('maps queue names to stats queue keys', () => {
    expect(defaultQueueFor('Core Set 14 BO1')).toBe('core-bo1')
    expect(defaultQueueFor('Core Set 14 BO3')).toBe('core-bo3')
    expect(defaultQueueFor('Infinity BO1')).toBe('infinity-bo1')
    expect(defaultQueueFor('Infinity Constructed BO3')).toBe('infinity-bo3')
    expect(defaultQueueFor(null)).toBe('core-bo1')
  })
})

describe('deckDoctorVerdict', () => {
  const nameOf = (id) => ({ '1-3': 'Rafiki', '1-2': 'Simba', '1-9': 'Nala' }[id] ?? id)
  it('names the archetype, the missing lift cards, the negative cards you run, the weakest card and the worst matchup', () => {
    const blocks = deckDoctorVerdict({
      eraName: 'Set 14',
      nameOf,
      archetype: { name: 'Amber/Emerald Circle of Life', shared: 47, total: 60 },
      lifts: liftChecklist(profile().cardLift, countsFromDecklist(list([['1-2', 4]]))),
      impact: [{ name: 'Simba', war: -2.3, gamesWith: 14, lowSample: false }, { name: 'Nala', war: 1, gamesWith: 20, lowSample: false }],
      matchups: [{ oppColors: ['ruby', 'sapphire'], games: 23, wins: 7, shrunkWinRate: 31, fieldWinRate: 48, gap: -17, significant: true }],
    })
    const text = blocks.map((b) => b.text).join('\n')
    expect(blocks.every((b) => b.type === 'text')).toBe(true)
    expect(text).toContain('Amber/Emerald Circle of Life')
    expect(text).toContain('47 of 60')
    expect(text).toContain('Rafiki')
    expect(text).toContain('Nala')
    expect(text).toContain('Simba')
    expect(text).toContain('Ruby/Sapphire')
    expect(text).toContain('23 games')
  })
  it('omits each sentence whose input is empty and explains a missing archetype', () => {
    const blocks = deckDoctorVerdict({ eraName: 'Set 14', archetype: null, noProfiles: true, lifts: [], impact: [], matchups: [] })
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toContain("hasn't published")
    expect(blocks[1].text).toContain('sample noise')
  })
})

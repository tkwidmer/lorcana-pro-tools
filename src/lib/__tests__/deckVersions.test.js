import { describe, it, expect } from 'vitest'
import { fromMatchHistoryRow, buildDeckVersions, compareVersions, GAMES_NEEDED } from '../deckVersions'

const NAMES = {
  '11-55': 'Christopher Robin - Joining the Fun',
  '12-22': 'Dale - Ready for His Shot',
  '12-61': 'Dash Parr - Lava Runner',
  '12-47': "Will o' the Wisp - Forest Spirit",
  '12-P3-51': "Will o' the Wisp - Forest Spirit",
  '9-6': 'Aurora - Holding Court',
  '9-206': 'Aurora - Holding Court',
}

let day = 0
function row(list, result = 'win', extra = {}) {
  day++
  return {
    game_id: `g${day}`,
    your_deck_id: 'deck-1',
    your_decklist: Object.entries(list).map(([cardId, count]) => ({ cardId, count })),
    started_at: new Date(Date.UTC(2026, 8, 1) + day * 3600e3).toISOString(),
    result,
    opp_deck_colors: 'Ruby/Sapphire',
    ...extra,
  }
}

const A = { '11-55': 4, '12-47': 4, '9-6': 4 }
const B = { '12-22': 4, '12-47': 4, '9-6': 4 }
const A_PROMO = { '11-55': 4, '12-P3-51': 4, '9-6': 4 } // Will o' the Wisp promo
const A_REPRINT = { '11-55': 4, '12-47': 4, '9-206': 4 } // Aurora reprint

const build = rows => buildDeckVersions(rows.map(fromMatchHistoryRow), NAMES)

describe('fromMatchHistoryRow', () => {
  it('maps result to won and normalizes opponent colors', () => {
    const g = fromMatchHistoryRow(row(A, 'loss'))
    expect(g).toMatchObject({ deckKey: 'deck-1', won: false, oppColors: 'ruby+sapphire' })
    expect(fromMatchHistoryRow(row(A, 'draw')).won).toBeNull()
  })
})

describe('buildDeckVersions', () => {
  it('treats a printing swap (reprint or promo) as the same version', () => {
    const { decks } = build([row(A), row(A_PROMO), row(A_REPRINT)])
    expect(decks[0].versions).toHaveLength(1)
    expect(decks[0].versions[0].games).toHaveLength(3)
  })

  it('labels versions by first game, with the card changes from the previous one', () => {
    const { decks } = build([row(A), row(B, 'loss'), row(B)])
    const [v1, v2] = decks[0].versions
    expect(v1).toMatchObject({ label: 'v1', wins: 1, losses: 0, changes: null })
    expect(v2).toMatchObject({ label: 'v2', wins: 1, losses: 1, winRate: 0.5 })
    expect(v2.changes).toEqual({
      toAdd: [{ name: 'Dale - Ready for His Shot', count: 4 }],
      toRemove: [{ name: 'Christopher Robin - Joining the Fun', count: 4 }],
    })
  })

  it('reuses a version when a list comes back, recording each span', () => {
    const rows = [row(A), row(A), row(B), row(A_PROMO)]
    const { decks } = build(rows)
    const [v1, v2] = decks[0].versions
    expect(decks[0].versions).toHaveLength(2)
    expect(v1.spans).toEqual([
      { from: rows[0].started_at, to: rows[1].started_at },
      { from: rows[3].started_at, to: rows[3].started_at },
    ])
    expect(v2.spans).toHaveLength(1)
  })

  it('orders games by time regardless of input order', () => {
    const rows = [row(A), row(B)]
    const { decks } = build([...rows].reverse())
    expect(decks[0].versions.map(v => v.games[0].id)).toEqual(['g' + (day - 1), 'g' + day])
  })

  it('puts games with no deck id or no list in unassigned', () => {
    const { decks, unassigned } = build([row(A), row(A, 'win', { your_deck_id: null }), row(A, 'win', { your_decklist: null })])
    expect(decks[0].games).toBe(1)
    expect(unassigned).toHaveLength(2)
  })

  it('throws on a card id the card data does not know', () => {
    expect(() => build([row({ '99-1': 4 })])).toThrow(/99-1/)
  })
})

describe('compareVersions', () => {
  const version = (wins, losses) => ({
    wins, losses,
    games: [
      ...Array.from({ length: wins }, () => ({ won: true, oppColors: 'ruby+sapphire' })),
      ...Array.from({ length: losses }, () => ({ won: false, oppColors: 'amber+steel' })),
    ],
  })

  it('needs about 393 games a version to detect a 10-point difference', () => {
    expect(GAMES_NEEDED).toBe(393)
  })

  it('says not enough games when the interval spans zero on small samples', () => {
    expect(compareVersions(version(8, 4), version(6, 6)).verdict).toBe('not-enough-games')
  })

  it('names the version that is ahead when the interval excludes zero', () => {
    expect(compareVersions(version(70, 30), version(40, 60)).verdict).toBe('a-ahead')
    expect(compareVersions(version(40, 60), version(70, 30)).verdict).toBe('b-ahead')
  })

  it('says no clear difference once both versions have enough games', () => {
    expect(compareVersions(version(200, 200), version(201, 199)).verdict).toBe('no-clear-difference')
  })

  it('handles a version with no decisive games', () => {
    expect(compareVersions(version(0, 0), version(5, 5))).toMatchObject({ diff: null, interval: null, verdict: 'not-enough-games' })
  })

  it('splits both records by opponent colors, most-played first', () => {
    const { byOppColors } = compareVersions(version(3, 1), version(1, 1))
    expect(byOppColors).toEqual([
      { oppColors: 'ruby+sapphire', a: { wins: 3, losses: 0 }, b: { wins: 1, losses: 0 } },
      { oppColors: 'amber+steel', a: { wins: 0, losses: 1 }, b: { wins: 0, losses: 1 } },
    ])
  })
})

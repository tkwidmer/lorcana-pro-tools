import { describe, it, expect } from 'vitest'
import { searchCards, getCardsByIds } from '../cardSearch'

const core = { Core: { allowed: true }, Infinity: { allowed: true } }
const cards = [
  { setCode: '14', number: 222, fullName: 'Flash - Efficient Clerk', type: 'Character', color: 'Steel', cost: 2, inkwell: false, willpower: 2, lore: 2, fullText: 'Resist +1', allowedInFormats: core },
  { setCode: '14', number: 171, fullName: 'Flash - Efficient Clerk', type: 'Character', color: 'Steel', cost: 2, inkwell: false, willpower: 2, lore: 2, fullText: 'Resist +1', allowedInFormats: core },
  { setCode: '12', number: 51, promoGrouping: 'P3', fullName: "Will o' the Wisp - Forest Spirit", type: 'Character', color: 'Amethyst', cost: 1, inkwell: true, willpower: 3, lore: 1, allowedInFormats: core },
  { setCode: '13', number: 41, fullName: 'Panic - Hammer Enthusiast', type: 'Character', color: 'Amethyst', cost: 3, inkwell: true, willpower: 1, lore: 2, fullText: 'Rush', allowedInFormats: core },
  { setCode: '13', number: 99, fullName: 'Mickey Mouse & Minnie Mouse - Adventuring Duo', type: 'Character', color: 'Emerald-Sapphire', cost: 7, inkwell: true, willpower: 5, lore: 5, allowedInFormats: core },
  { setCode: '1', number: 197, fullName: 'Fire the Cannons!', type: 'Action', color: 'Steel', cost: 1, inkwell: false, allowedInFormats: { Core: { allowed: false }, Infinity: { allowed: true } } },
]
const names = r => r.cards.map(c => c.fullName)

describe('searchCards', () => {
  it('keeps cards inside the deck colors and collapses reprints into one row with every id', () => {
    const r = searchCards(cards, { colors: ['Amethyst', 'Steel'], format: 'Core' })
    expect(names(r)).toEqual(["Will o' the Wisp - Forest Spirit", 'Flash - Efficient Clerk', 'Panic - Hammer Enthusiast'])
    expect(r.cards[1].ids).toEqual(['14-222', '14-171'])
    expect(r.cards[0].ids).toEqual(['12-P3-51'])
  })

  it('needs every color of a dual-ink card inside the deck colors', () => {
    expect(names(searchCards(cards, { colors: ['Emerald'] }))).toEqual([])
    expect(names(searchCards(cards, { colors: ['Emerald', 'Sapphire'] }))).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
  })

  it('filters by stats, inkwell and text', () => {
    expect(names(searchCards(cards, { colors: ['Amethyst', 'Steel'], minWillpower: 2, inkwell: true }))).toEqual(["Will o' the Wisp - Forest Spirit"])
    expect(names(searchCards(cards, { text: 'rush' }))).toEqual(['Panic - Hammer Enthusiast'])
    expect(searchCards(cards, { limit: 1 })).toMatchObject({ total: 5, cards: [{ fullName: 'Fire the Cannons!' }] })
  })
})

describe('getCardsByIds', () => {
  it('resolves duels.ink ids, promos included, and reports unknown ids', () => {
    const r = getCardsByIds(cards, ['12-P3-51', '14-222', '99-1'])
    expect(r.cards.map(c => [c.id, c.fullName, c.inkwell])).toEqual([
      ['12-P3-51', "Will o' the Wisp - Forest Spirit", true],
      ['14-222', 'Flash - Efficient Clerk', false],
    ])
    expect(r.missing).toEqual(['99-1'])
  })
})

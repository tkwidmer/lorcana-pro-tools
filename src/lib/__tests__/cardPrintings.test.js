import { describe, it, expect } from 'vitest'
import { cardPath, findPrinting, groupPrintings, primaryPrinting, setOrder } from '../cardPrintings'

const elsa1 = { id: 42, setCode: '1', number: 42, fullName: 'Elsa - Spirit of Winter', rarity: 'Legendary' }
const elsa1Ench = { id: 207, setCode: '1', number: 207, baseId: 42, fullName: 'Elsa - Spirit of Winter', rarity: 'Enchanted' }
const elsaPromo = { id: 900, setCode: '1', number: 42, promoGrouping: 'P1', baseId: 42, fullName: 'Elsa - Spirit of Winter', rarity: 'Special' }
const elsa9 = { id: 1979, setCode: '9', number: 40, reprintOfId: 42, fullName: 'Elsa - Spirit of Winter', rarity: 'Legendary' }
const puppyC = { id: 438, setCode: '3', number: 4, variant: 'c', fullName: 'Dalmatian Puppy - Tail Wagger' }
const puppy8 = { id: 1702, setCode: '8', number: 38, reprintOfId: 436, fullName: 'Dalmatian Puppy - Tail Wagger' }
const quest = { id: 5000, setCode: 'Q1', number: 1, fullName: 'Anna - Ensnared Sister' }
const cards = [elsa9, elsaPromo, elsa1Ench, elsa1, puppy8, puppyC, quest]

describe('cardPath', () => {
  it('turns the duels.ink id into a route', () => {
    expect(cardPath(elsa1)).toBe('/cards/1/42')
    expect(cardPath(elsaPromo)).toBe('/cards/1/P1-42')
    expect(cardPath(puppyC)).toBe('/cards/3/4c')
    expect(cardPath(quest)).toBe('/cards/Q1/1')
  })
})

describe('findPrinting', () => {
  it('resolves a route back to its printing, promo and variant included', () => {
    expect(findPrinting(cards, '1', '42')).toBe(elsa1)
    expect(findPrinting(cards, '1', 'P1-42')).toBe(elsaPromo)
    expect(findPrinting(cards, '3', '4c')).toBe(puppyC)
    expect(findPrinting(cards, '1', '999')).toBeNull()
  })
})

describe('groupPrintings', () => {
  it('maps each printing to all printings of its card, regular before promos, sets in order', () => {
    const groups = groupPrintings(cards)
    expect(groups.get(elsa1).map(c => c.id)).toEqual([42, 207, 900, 1979])
    expect(groups.get(elsaPromo)).toBe(groups.get(elsa9))
    expect(groups.get(puppyC).map(c => c.id)).toEqual([438, 1702])
    expect(groups.get(quest).map(c => c.id)).toEqual([5000])
  })

  it('joins printings linked by baseId or reprintOfId even when the printed name differs', () => {
    // LorcanaJSON: the set-1 C210 Let it Go and the Vaiana promo of Moana.
    const letItGo = { id: 163, setCode: '1', number: 163, fullName: 'Let It Go', rarity: 'Rare' }
    const letItGoC = { id: 2460, setCode: '1', number: 210, promoGrouping: 'C', baseId: 163, fullName: 'Let it Go', rarity: 'Special' }
    const moana = { id: 1589, setCode: '7', number: 156, fullName: 'Moana - Adventurer of Land and Sea', rarity: 'Common' }
    const vaiana = { id: 1663, setCode: '7', number: 226, promoGrouping: 'P2', baseId: 1589, fullName: 'Vaiana - Adventurer of Land and Sea', rarity: 'Special' }
    const groups = groupPrintings([vaiana, letItGoC, letItGo, moana])
    expect(groups.get(letItGo).map(c => c.id)).toEqual([163, 2460])
    expect(groups.get(vaiana).map(c => c.id)).toEqual([1589, 1663])
  })

  it('sorts quest sets after the numbered sets', () => {
    expect(setOrder(quest)).toBeGreaterThan(setOrder({ setCode: '16' }))
  })
})

describe('primaryPrinting', () => {
  it('prefers the latest base printing over enchanteds, promos and variants', () => {
    expect(primaryPrinting([elsa1, elsa1Ench, elsaPromo, elsa9])).toBe(elsa9)
    expect(primaryPrinting([elsa1, elsa1Ench, elsaPromo])).toBe(elsa1)
    expect(primaryPrinting([puppyC, puppy8])).toBe(puppy8)
  })

  it('falls back to the first printing when none is a base printing', () => {
    expect(primaryPrinting([elsa1Ench, elsaPromo])).toBe(elsa1Ench)
  })
})

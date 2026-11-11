import { describe, it, expect } from 'vitest'
import { parseQuery, QuerySyntaxError, norm, runQuery } from '../cardQuery'

const sets = {
  '1': { name: 'The First Chapter', releaseDate: '2023-09-01' },
  '9': { name: 'Fabled', releaseDate: '2025-09-05' },
  'Q1': { name: "Illumineer's Quest: Deep Trouble", releaseDate: '2024-05-31' },
}
const legal = { Core: { allowed: true }, Infinity: { allowed: true } }
const elsa = { setCode: '1', number: 42, fullName: 'Elsa - Spirit of Winter', name: 'Elsa', version: 'Spirit of Winter', type: 'Character', subtypesText: 'Floodborn • Hero • Queen • Sorcerer', subtypes: ['Floodborn', 'Hero', 'Queen', 'Sorcerer'], color: 'Amethyst', cost: 8, inkwell: false, strength: 4, willpower: 6, lore: 3, rarity: 'Legendary', keywordAbilities: ['Shift'], fullText: 'Shift 6 (You may pay 6 ⬡ to play this on top of one of\nyour characters named Elsa.)\nDEEP FREEZE When you play this character, exert up\nto 2 chosen characters.', flavorText: 'Ice is stronger than you may think.', artistsText: 'Matthew Robert Davies', story: 'Frozen', allowedInFormats: legal }
const teKa = { setCode: '9', number: 120, fullName: 'Te Kā - The Burning One', name: 'Te Kā', type: 'Character', subtypesText: 'Storyborn • Villain • Deity', subtypes: ['Storyborn', 'Villain', 'Deity'], color: 'Ruby', cost: 6, inkwell: true, strength: 6, willpower: 5, lore: 2, rarity: 'Super Rare', fullText: 'Rush', keywordAbilities: ['Rush'], artistsText: 'Someone', story: 'Moana', allowedInFormats: legal }
const duo = { setCode: '9', number: 99, fullName: 'Mickey Mouse & Minnie Mouse - Adventuring Duo', name: 'Mickey Mouse & Minnie Mouse', type: 'Character', subtypesText: 'Dreamborn • Hero', subtypes: ['Dreamborn', 'Hero'], color: 'Emerald-Sapphire', cost: 7, inkwell: true, strength: 5, willpower: 5, lore: 5, rarity: 'Rare', fullText: '', artistsText: 'A', story: 'Mickey Mouse & Friends', allowedInFormats: legal }
const song = { setCode: '1', number: 26, fullName: 'Be Our Guest', name: 'Be Our Guest', type: 'Action', subtypesText: 'Song', subtypes: ['Song'], color: 'Amber', cost: 2, inkwell: true, rarity: 'Common', fullText: '(A character with cost 2 or more can ⟳ to sing this\nsong for free.)\nLook at the top 4 cards of your deck.', artistsText: 'B', story: 'Beauty and the Beast', allowedInFormats: { Core: { allowed: false, allowedUntilDate: '2025-09-05' }, Infinity: { allowed: true } } }
const hiram = { setCode: '2', number: 149, fullName: 'Hiram Flaversham - Toymaker', name: 'Hiram Flaversham', type: 'Character', subtypesText: 'Storyborn • Ally • Inventor', subtypes: ['Storyborn', 'Ally', 'Inventor'], color: 'Sapphire', cost: 4, inkwell: true, strength: 1, willpower: 6, lore: 2, rarity: 'Rare', fullText: 'ARTIFICER When you play this character and whenever he quests, you may banish one of your items to draw 2 cards.', errata: ['x'], artistsText: 'C', story: 'The Great Mouse Detective', allowedInFormats: { Core: { allowed: false, allowedUntilDate: '2025-04-08', bannedSinceDate: '2025-04-08' }, Infinity: { allowed: false, bannedSinceDate: '2026-03-26' } } }
const promo = { ...elsa, number: 42, promoGrouping: 'P1', baseId: 42, rarity: 'Special' }
const quest = { setCode: 'Q1', number: 1, fullName: 'Anna - Ensnared Sister', name: 'Anna', type: 'Character', subtypesText: 'Storyborn • Hero • Queen', subtypes: ['Storyborn', 'Hero', 'Queen'], color: '', cost: 3, inkwell: false, strength: 2, willpower: 3, lore: 1, rarity: 'Special', fullText: '', artistsText: 'D', story: 'Frozen', allowedInFormats: { Core: { allowed: false }, Infinity: { allowed: false } } }
const cards = [elsa, teKa, duo, song, hiram, promo, quest]

const names = q => cards.filter(parseQuery(q, sets).predicate).map(c => c.fullName)
const uniq = q => [...new Set(names(q))]

describe('norm', () => {
  it('strips accents, case and wrapped whitespace', () => {
    expect(norm('Te Kā -  The\nBurning One')).toBe('te ka - the burning one')
  })
})

describe('name terms', () => {
  it('bare words search the name, accent-insensitively, ANDed', () => {
    expect(uniq('te ka')).toEqual(['Te Kā - The Burning One'])
    expect(uniq('spirit winter')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('"spirit of"')).toEqual(['Elsa - Spirit of Winter'])
  })

  it('!"name" is exact on fullName or name', () => {
    expect(uniq('!"Elsa - Spirit of Winter"')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('!elsa')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('!"Elsa - Spirit"')).toEqual([])
  })
})

describe('text terms', () => {
  it('o: searches the text across line wraps, ~ is the card name, regex works', () => {
    expect(uniq('o:"exert up to 2"')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('fo:"characters named ~"')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('o:/banish .* items?/')).toEqual(['Hiram Flaversham - Toymaker'])
    expect(uniq('ft:ice')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('a:"robert davies"')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('story:frozen')).toEqual(['Elsa - Spirit of Winter', 'Anna - Ensnared Sister'])
    expect(uniq('v:"spirit of winter"')).toEqual(['Elsa - Spirit of Winter'])
  })

  it('rejects comparison operators on text', () => {
    expect(() => parseQuery('o>foo', sets)).toThrow(QuerySyntaxError)
  })
})

describe('type and keyword', () => {
  it('t: matches the type or any subtype; t= is the exact type', () => {
    expect(uniq('t:song')).toEqual(['Be Our Guest'])
    expect(uniq('t:floodborn')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('t=action')).toEqual(['Be Our Guest'])
    expect(uniq('t=hero')).toEqual([])
  })

  it('k: is an exact keyword', () => {
    expect(uniq('k:shift')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('k:rush')).toEqual(['Te Kā - The Burning One'])
    expect(uniq('k:shif')).toEqual([])
  })
})

describe('colors', () => {
  it('c: is at-least, c= exact, c<= within, c:m dual, c:colorless none', () => {
    expect(uniq('c:emerald')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('c=emerald')).toEqual([])
    expect(uniq('c=emerald,sapphire')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('c<=amber,amethyst')).toEqual(['Elsa - Spirit of Winter', 'Be Our Guest', 'Anna - Ensnared Sister'])
    expect(uniq('c:m')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('c:colorless')).toEqual(['Anna - Ensnared Sister'])
    expect(uniq('c>emerald')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('c!=ruby -c:colorless').sort()).toEqual(['Be Our Guest', 'Elsa - Spirit of Winter', 'Hiram Flaversham - Toymaker', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'].sort())
  })

  it('ci: is the deck identity (card inks within the query)', () => {
    expect(uniq('ci:ruby,sapphire -c:colorless')).toEqual(['Te Kā - The Burning One', 'Hiram Flaversham - Toymaker'])
    expect(uniq('id:emerald')).toEqual(['Anna - Ensnared Sister'])
  })

  it('rejects an unknown ink', () => {
    expect(() => parseQuery('c:blue', sets)).toThrow('Unknown ink')
  })
})

describe('stats', () => {
  it('compares numbers and other stats', () => {
    expect(uniq('cost<=3')).toEqual(['Be Our Guest', 'Anna - Ensnared Sister'])
    expect(uniq('cost:7')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('str>=6')).toEqual(['Te Kā - The Burning One'])
    expect(uniq('will>str')).toEqual(['Elsa - Spirit of Winter', 'Hiram Flaversham - Toymaker', 'Anna - Ensnared Sister'])
    expect(uniq('lore>=3 is:inkable')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('pow!=4 t=character -c:colorless')).toEqual(['Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo', 'Hiram Flaversham - Toymaker'])
  })

  it('a missing stat never compares true', () => {
    expect(uniq('str<100')).not.toContain('Be Our Guest')
    expect(uniq('move>=0')).toEqual([])
  })

  it('rejects a non-numeric value', () => {
    expect(() => parseQuery('cost:big', sets)).toThrow(QuerySyntaxError)
  })
})

describe('rarity, set, number, year', () => {
  it('orders rarities and accepts aliases', () => {
    expect(uniq('r:legendary')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('r>=sr -r:special')).toEqual(['Elsa - Spirit of Winter', 'Te Kā - The Burning One'])
    expect(uniq('r:c')).toEqual(['Be Our Guest'])
    expect(() => parseQuery('r:mythic', sets)).toThrow('Unknown rarity')
  })

  it('s: is a set code or a set-name substring', () => {
    expect(uniq('s:9')).toEqual(['Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('set:fabled')).toEqual(['Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('e:q1')).toEqual(['Anna - Ensnared Sister'])
  })

  it('cn: and year:', () => {
    expect(uniq('cn:42 -is:promo')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('cn<30 s:1')).toEqual(['Be Our Guest'])
    expect(uniq('year>=2025')).toEqual(['Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'])
  })
})

describe('legality and is:', () => {
  it('f: and banned:', () => {
    expect(uniq('f:core')).toEqual(['Elsa - Spirit of Winter', 'Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('f:infinity -f:core')).toEqual(['Be Our Guest'])
    expect(uniq('banned:core')).toEqual(['Hiram Flaversham - Toymaker'])
    expect(uniq('legal:coconut t:song')).toEqual(['Be Our Guest'])
    expect(() => parseQuery('f:standard', sets)).toThrow('Unknown format')
  })

  it('is: flags and not:', () => {
    expect(uniq('is:uninkable')).toEqual(['Elsa - Spirit of Winter', 'Anna - Ensnared Sister'])
    expect(uniq('is:dual')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('is:promo')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('is:quest')).toEqual(['Anna - Ensnared Sister'])
    expect(uniq('is:banned')).toEqual(['Hiram Flaversham - Toymaker'])
    expect(uniq('is:errata')).toEqual(['Hiram Flaversham - Toymaker'])
    expect(uniq('not:inkable')).toEqual(uniq('is:uninkable'))
    expect(() => parseQuery('is:foil', sets)).toThrow('Unknown is: value')
  })
})

describe('boolean structure', () => {
  it('or, negation and parentheses', () => {
    expect(uniq('t:song or k:rush')).toEqual(['Te Kā - The Burning One', 'Be Our Guest'])
    expect(uniq('(t:song OR k:rush) -c:ruby')).toEqual(['Be Our Guest'])
    expect(uniq('-(c:amber or c:amethyst or c:ruby or c:colorless)')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo', 'Hiram Flaversham - Toymaker'])
  })

  it('throws on unbalanced parentheses', () => {
    expect(() => parseQuery('(t:song', sets)).toThrow(QuerySyntaxError)
    expect(() => parseQuery('t:song)', sets)).toThrow(QuerySyntaxError)
  })

  it('throws on a dangling or', () => {
    expect(() => parseQuery('t:song or', sets)).toThrow(QuerySyntaxError)
    expect(() => parseQuery('or t:song', sets)).toThrow(QuerySyntaxError)
  })

  it('throws on a trailing "-", an unclosed quote and a bad regex', () => {
    expect(() => parseQuery('elsa -', sets)).toThrow(QuerySyntaxError)
    expect(() => parseQuery('"spirit of', sets)).toThrow('Missing closing quote')
    expect(() => parseQuery('n:"spirit', sets)).toThrow('Missing closing quote')
    expect(() => parseQuery('o:/(/', sets)).toThrow(QuerySyntaxError)
  })

  it('rejects comparison operators on keys that only test membership', () => {
    for (const q of ['k>shift', 's<9', 'is>inkable', 'f!=core', 'banned<core', 'order>cost']) {
      expect(() => parseQuery(q, sets)).toThrow(QuerySyntaxError)
    }
    expect(uniq('k=shift')).toEqual(['Elsa - Spirit of Winter'])
  })

  it('throws on an unknown key', () => {
    expect(() => parseQuery('usd>5', sets)).toThrow('Unknown search key "usd"')
  })
})

describe('directives', () => {
  it('reads order, direction and unique, with defaults', () => {
    expect(parseQuery('elsa', sets)).toMatchObject({ order: 'name', direction: 'asc', unique: 'cards' })
    expect(parseQuery('elsa order:cost dir:desc unique:prints', sets)).toMatchObject({ order: 'cost', direction: 'desc', unique: 'prints' })
    expect(() => parseQuery('order:price', sets)).toThrow('Unknown order')
    expect(() => parseQuery('unique:art', sets)).toThrow(QuerySyntaxError)
  })

  it('an empty query matches everything', () => {
    expect(names('')).toHaveLength(cards.length)
  })
})

describe('runQuery', () => {
  const elsa9 = { ...elsa, setCode: '9', number: 40, reprintOfId: 42 }
  const all = [...cards, elsa9]

  it('dedupes by name and shows the latest base printing', () => {
    const r = runQuery(all, sets, 'elsa')
    expect(r).toHaveLength(1)
    expect(r[0]).toBe(elsa9)
  })

  it('picks the matching printing when the query narrows the set', () => {
    expect(runQuery(all, sets, 'elsa s:1')[0]).toBe(elsa)
    expect(runQuery(all, sets, 'elsa is:promo')[0]).toBe(promo)
  })

  it('unique:prints returns every printing in printing order', () => {
    expect(runQuery(all, sets, 'elsa unique:prints').map(c => `${c.setCode}-${c.promoGrouping ?? ''}${c.number}`)).toEqual(['1-42', '1-P142', '9-40'])
  })

  it('sorts by name by default, and by the requested order', () => {
    expect(runQuery(all, sets, '-c:colorless').map(c => c.fullName)).toEqual([
      'Be Our Guest', 'Elsa - Spirit of Winter', 'Hiram Flaversham - Toymaker', 'Mickey Mouse & Minnie Mouse - Adventuring Duo', 'Te Kā - The Burning One',
    ])
    expect(runQuery(all, sets, 't=character order:cost dir:desc').map(c => c.cost)).toEqual([8, 7, 6, 4, 3])
    expect(runQuery(all, sets, 'order:rarity').map(c => c.rarity)).toEqual(['Common', 'Rare', 'Rare', 'Super Rare', 'Legendary', 'Special'])
    expect(runQuery(all, sets, 'order:released dir:desc')[0].setCode).toBe('9')
  })

  it('returns nothing for an empty query', () => {
    expect(runQuery(all, sets, '  ')).toEqual([])
  })
})

describe('Scryfall parity (live syntax page)', () => {
  it('o: ignores reminder text, fo: searches it', () => {
    expect(uniq('o:"sing this song"')).toEqual([])
    expect(uniq('fo:"sing this song"')).toEqual(['Be Our Guest'])
    expect(uniq('o:"you may pay"')).toEqual([])
    expect(uniq('fulloracle:"you may pay"')).toEqual(['Elsa - Spirit of Winter'])
    expect(uniq('o:"deep freeze"')).toEqual(['Elsa - Spirit of Winter'])
  })

  it('kw:, edition:, manavalue: aliases', () => {
    expect(uniq('kw:rush')).toEqual(['Te Kā - The Burning One'])
    expect(uniq('edition:fabled')).toEqual(uniq('s:9'))
    expect(uniq('manavalue=7')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
  })

  it('a number in c: compares the ink count', () => {
    expect(uniq('c=2')).toEqual(['Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('c=0')).toEqual(['Anna - Ensnared Sister'])
    expect(uniq('c>1')).toEqual(uniq('c=2'))
    expect(uniq('c<2 -c=0')).toEqual(['Elsa - Spirit of Winter', 'Te Kā - The Burning One', 'Be Our Guest', 'Hiram Flaversham - Toymaker'])
  })

  it('t: accepts a regex', () => {
    expect(uniq('t:/^action/')).toEqual(['Be Our Guest'])
    expect(uniq('t:/\\bqueen\\b/ -is:quest')).toEqual(['Elsa - Spirit of Winter'])
    // Anchors apply to the type and to each subtype on its own (the spec's t:/^(prince|princess)$/ example).
    expect(uniq('t:/^(villain|deity)$/')).toEqual(['Te Kā - The Burning One'])
    expect(uniq('t:/^song$/')).toEqual(['Be Our Guest'])
  })

  it('date: takes yyyy-mm-dd or a set code', () => {
    expect(uniq('date>=2025-09-05')).toEqual(['Te Kā - The Burning One', 'Mickey Mouse & Minnie Mouse - Adventuring Duo'])
    expect(uniq('date<9 -is:quest')).toEqual(['Elsa - Spirit of Winter', 'Be Our Guest'])
    expect(uniq('date=q1')).toEqual(['Anna - Ensnared Sister'])
    expect(() => parseQuery('date>soon', sets)).toThrow(QuerySyntaxError)
  })

  it('order aliases from Scryfall', () => {
    expect(parseQuery('order:cmc', sets).order).toBe('cost')
    expect(parseQuery('order:power', sets).order).toBe('strength')
    expect(parseQuery('order:toughness', sets).order).toBe('willpower')
    const all = [...cards]
    expect(runQuery(all, sets, 'order:color -c:colorless').map(c => c.color)).toEqual(['Amber', 'Amethyst', 'Emerald-Sapphire', 'Ruby', 'Sapphire'])
    expect(runQuery(all, sets, 'order:artist').map(c => c.artistsText)[0]).toBe('A')
  })
})

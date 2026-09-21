import { describe, it, expect } from 'vitest'
import { generateCoconutDecklistText, parseCoconutDecklist } from '../coconutDecklistText'
import { COCONUT_CARDS } from '../coconutCards'
import { MAX_INKS } from '../coconutFormat'

const belle = COCONUT_CARDS.find(c => c.id === 'belle-and-beast-certain-as-the-sun')
const nick = COCONUT_CARDS.find(c => c.id === 'nick-wilde-wily-fox')

const cardsByFullName = new Map([
  ['belle & beast - certain as the sun', {
    fullName: 'Belle & Beast - Certain as the Sun',
    name: 'Belle & Beast', version: 'Certain as the Sun', cost: 8, color: 'Ruby-Sapphire', type: 'Character',
  }],
  ['nick wilde - wily fox', {
    fullName: 'Nick Wilde - Wily Fox',
    name: 'Nick Wilde', version: 'Wily Fox', cost: 3, color: 'Sapphire', type: 'Character',
  }],
])
const getEffectiveType = c => c.type

describe('generateCoconutDecklistText (duels.ink format)', () => {
  const deck = {
    name: 'Duo Test',
    inks: ['ruby', 'sapphire'],
    cards: [{ fullName: 'Belle & Beast - Certain as the Sun', qty: 4, cost: 8 }],
  }

  it("comments every metadata line so duels.ink's parser skips it", () => {
    // Its parser skips blank, `#`, `//` and `Coconut:` lines, and treats any
    // other unrecognized line as a bad card entry.
    const lines = generateCoconutDecklistText(deck, nick).split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      const isComment = line.startsWith('#')
      const isCoconutHeader = /^coconut:\s*\S+$/i.test(line)
      const isCardLine = /^\d+x?\s+.+$/.test(line)
      expect(isComment || isCoconutHeader || isCardLine, `unparseable line: ${line}`).toBe(true)
    }
  })

  it("emits duels.ink's Coconut header for a card it carries", () => {
    const text = generateCoconutDecklistText({ ...deck, cards: [] }, nick)
    expect(text).toContain(`Coconut: ${nick.duelsId}`)
  })

  it('omits the header for a duo card duels.ink has no id for', () => {
    expect(belle.duelsId).toBeUndefined()
    const text = generateCoconutDecklistText(deck, belle)
    expect(text).not.toMatch(/^Coconut:/m)
    // The base-card comment still identifies it for our own re-import.
    expect(text).toContain(`# Coconut Card: ${belle.baseFullName}`)
  })
})

describe('parseCoconutDecklist', () => {
  it('identifies a duo Coconut card from the header', () => {
    const text = [
      '[Format Coconut]',
      'Deck: Test',
      'Coconut Card: Belle & Beast - Certain as the Sun',
      'Inks: Ruby/Sapphire',
      '',
      '4 Belle & Beast - Certain as the Sun',
    ].join('\n')
    const result = parseCoconutDecklist(text, cardsByFullName, getEffectiveType)
    expect(result.coconutCard?.id).toBe(belle.id)
    expect(result.inks).toEqual(expect.arrayContaining(['ruby', 'sapphire']))
  })

  it('keeps BOTH of a duo leader\'s inks even when the header lists other inks first', () => {
    // Amber/Amethyst/Steel would fill MAX_INKS on their own; the leader's two
    // inks must still survive the cap.
    const text = [
      '[Format Coconut]',
      'Coconut Card: Belle & Beast - Certain as the Sun',
      'Inks: Amber/Amethyst/Steel',
      '',
      '4 Belle & Beast - Certain as the Sun',
    ].join('\n')
    const result = parseCoconutDecklist(text, cardsByFullName, getEffectiveType)
    expect(result.inks.length).toBeLessThanOrEqual(MAX_INKS)
    for (const ink of belle.inks) expect(result.inks).toContain(ink)
  })

  it('still puts a single-ink leader\'s ink first', () => {
    const text = [
      '[Format Coconut]',
      'Coconut Card: Nick Wilde - Wily Fox',
      'Inks: Amber/Ruby',
      '',
      '4 Nick Wilde - Wily Fox',
    ].join('\n')
    const result = parseCoconutDecklist(text, cardsByFullName, getEffectiveType)
    expect(result.inks[0]).toBe(nick.inks[0])
  })

  it('round-trips a duo deck through generate -> parse', () => {
    const deck = {
      name: 'Duo Test',
      inks: ['ruby', 'sapphire'],
      cards: [{ fullName: 'Belle & Beast - Certain as the Sun', qty: 4, cost: 8 }],
    }
    const result = parseCoconutDecklist(
      generateCoconutDecklistText(deck, belle), cardsByFullName, getEffectiveType,
    )
    expect(result.coconutCard?.id).toBe(belle.id)
    expect(result.inks).toEqual(['ruby', 'sapphire'])
    expect(result.entries[0].qty).toBe(4)
  })
})

describe('duels.ink interop', () => {
  it('imports a list copied straight off duels.ink', () => {
    // duels.ink's own serializer: a `Coconut: <id>` header and card lines
    // suffixed with its card id, e.g. "4 Scar - Finally King (1-145)".
    const text = [
      'Coconut: coconut-008',
      '4 Nick Wilde - Wily Fox (3-89)',
    ].join('\n')
    const result = parseCoconutDecklist(text, cardsByFullName, getEffectiveType)
    expect(result.coconutCard?.id).toBe(nick.id)
    expect(result.entries[0].fullName).toBe('Nick Wilde - Wily Fox')
    expect(result.entries[0].qty).toBe(4)
    expect(result.unmatchedNames).toEqual([])
  })

  it('accepts the // comment marker duels.ink also skips', () => {
    const text = ['// Deck: Commented', 'Coconut: coconut-008', '4 Nick Wilde - Wily Fox'].join('\n')
    const result = parseCoconutDecklist(text, cardsByFullName, getEffectiveType)
    expect(result.deckName).toBe('Commented')
    expect(result.coconutCard?.id).toBe(nick.id)
  })

  it('gives every duels.ink-carried card a distinct coconut-NNN id', () => {
    const ids = COCONUT_CARDS.map(c => c.duelsId).filter(Boolean)
    expect(ids.length).toBe(18)
    expect(new Set(ids).size).toBe(18)
    for (const id of ids) expect(id).toMatch(/^coconut-\d{3}$/)
  })
})

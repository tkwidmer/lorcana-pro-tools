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

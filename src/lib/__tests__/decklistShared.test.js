import { describe, it, expect } from 'vitest'
import { encodeDeckParam, decodeDeckParam, inkFill, textColorFor, buildBuckets, BUCKET_ORDER } from '../decklistShared'

describe('encodeDeckParam / decodeDeckParam', () => {
  it('round-trips plain text', () => {
    const text = '4 Elsa - Snow Queen\n2 Let It Go'
    const encoded = encodeDeckParam(text)
    expect(decodeDeckParam(encoded)).toBe(text)
  })

  it('round-trips text with special/unicode characters', () => {
    const text = '1 Mother Gothel — "Selfish"\n4 Café'
    const encoded = encodeDeckParam(text)
    expect(decodeDeckParam(encoded)).toBe(text)
  })

  it('returns empty string on encode failure and null on decode failure', () => {
    expect(decodeDeckParam('not-valid-base64!!!')).toBeNull()
  })
})

describe('inkFill', () => {
  it('returns a gray fallback for unknown/empty colors', () => {
    expect(inkFill([])).toEqual({ background: '#9ca3af' })
  })

  it('returns a solid background for a single ink', () => {
    const result = inkFill(['amber'])
    expect(result.background).not.toContain('gradient')
  })

  it('returns a gradient for two inks', () => {
    const result = inkFill(['amber', 'ruby'])
    expect(result.background).toContain('linear-gradient')
  })
})

describe('textColorFor', () => {
  it('returns a hex color based on the first ink', () => {
    expect(textColorFor(['amber'])).toMatch(/^#/)
  })

  it('falls back to white for unknown ink', () => {
    expect(textColorFor(['not-an-ink'])).toBe('#ffffff')
  })
})

describe('buildBuckets', () => {
  const entry = (type, cost, name) => ({ name, card: { type, cost } })

  it('groups entries by card type into the 4 buckets', () => {
    const entries = [
      entry('Character', 3, 'Mickey Mouse'),
      entry('Action', 1, 'Fire the Cannons'),
      entry('Item', 2, 'Sword'),
      entry('Location', 4, 'Castle'),
    ]
    const buckets = buildBuckets(entries)
    expect(Object.keys(buckets)).toEqual(BUCKET_ORDER)
    expect(buckets.Character).toHaveLength(1)
    expect(buckets.Action).toHaveLength(1)
    expect(buckets.Item).toHaveLength(1)
    expect(buckets.Location).toHaveLength(1)
  })

  it('drops entries with an unrecognized type', () => {
    const entries = [entry('Unknown', 1, 'Weird Card')]
    const buckets = buildBuckets(entries)
    expect(buckets.Character).toHaveLength(0)
    expect(buckets.Action).toHaveLength(0)
    expect(buckets.Item).toHaveLength(0)
    expect(buckets.Location).toHaveLength(0)
  })

  it('sorts each bucket by cost then name', () => {
    const entries = [
      entry('Character', 5, 'Zeta'),
      entry('Character', 1, 'Beta'),
      entry('Character', 1, 'Alpha'),
    ]
    const buckets = buildBuckets(entries)
    expect(buckets.Character.map(e => e.name)).toEqual(['Alpha', 'Beta', 'Zeta'])
  })

  it('treats missing cost as 0 when sorting', () => {
    const entries = [
      entry('Item', undefined, 'NoCost'),
      entry('Item', 1, 'HasCost'),
    ]
    const buckets = buildBuckets(entries)
    expect(buckets.Item.map(e => e.name)).toEqual(['NoCost', 'HasCost'])
  })
})

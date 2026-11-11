import { describe, it, expect } from 'vitest'
import { tcgplayerSnapshot, printingPrice, usdOf, priceLabel } from '../cardPrices'

// The shape of https://duels.ink/api/prices (2026-11-11), trimmed.
const duels = {
  lastUpdated: '2026-11-11T02:00:01.540Z',
  currency: 'EUR',
  prices: { 726997: { regular: 10, foil: null } },
  cardmarket: { lastUpdated: '2026-11-11T02:00:01.540Z', currency: 'EUR', prices: { 726997: { regular: 10, foil: null } } },
  tcgplayer: {
    lastUpdated: '2026-11-11T02:00:01.882Z',
    currency: 'USD',
    prices: { 507512: { regular: 2, foil: 81.51 }, 510153: { regular: null, foil: 947.01 }, 454229: { regular: null, foil: null } },
  },
  cardnexus: { lastUpdated: '2026-11-11T02:00:02.527Z', tcgplayer: {} },
}

describe('tcgplayerSnapshot', () => {
  it('reads the TCGplayer USD prices out of the duels.ink response', () => {
    expect(tcgplayerSnapshot(duels)).toEqual({
      updatedAt: '2026-11-11T02:00:01.882Z',
      prices: { 507512: { normal: 2, foil: 81.51 }, 510153: { normal: null, foil: 947.01 }, 454229: { normal: null, foil: null } },
    })
  })

  it('throws when the response has no TCGplayer USD prices', () => {
    expect(() => tcgplayerSnapshot({ cardmarket: duels.cardmarket })).toThrow('no TCGplayer prices')
    expect(() => tcgplayerSnapshot({ tcgplayer: { ...duels.tcgplayer, currency: 'EUR' } })).toThrow('no TCGplayer prices')
  })
})

describe('printingPrice / usdOf / priceLabel', () => {
  const { prices } = tcgplayerSnapshot(duels)
  it('finds a printing by its TCGplayer id and tolerates missing ones', () => {
    expect(printingPrice(prices, { externalLinks: { tcgPlayerId: 507512 } })).toEqual({ normal: 2, foil: 81.51 })
    expect(printingPrice(prices, { externalLinks: { tcgPlayerId: 1 } })).toBeNull()
    expect(printingPrice(prices, {})).toBeNull()
    expect(printingPrice(null, { externalLinks: { tcgPlayerId: 507512 } })).toBeNull()
  })
  it('usdOf is the non-foil price, or the foil price when only foil exists', () => {
    expect(usdOf(prices[507512])).toBe(2)
    expect(usdOf(prices[510153])).toBe(947.01)
    expect(usdOf(prices[454229])).toBeNull()
    expect(usdOf(null)).toBeNull()
  })
  it('labels', () => {
    expect(priceLabel(prices[507512])).toBe('$2.00 · foil $81.51')
    expect(priceLabel(prices[510153])).toBe('foil $947.01')
    expect(priceLabel({ normal: 0.14, foil: null })).toBe('$0.14')
    expect(priceLabel(prices[454229])).toBe('—')
    expect(priceLabel(null)).toBe('—')
  })
})

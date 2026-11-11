import { describe, it, expect } from 'vitest'
import { FORMATS, formatStatus, legality } from '../cardLegality'

const card = allowedInFormats => ({ allowedInFormats })

describe('formatStatus', () => {
  it('reads legal, rotated and never-legal', () => {
    expect(formatStatus(card({ Core: { allowed: true } }), 'Core')).toEqual({ status: 'legal' })
    expect(formatStatus(card({ Core: { allowed: false, allowedUntilDate: '2025-09-05', rotationGroup: 1 } }), 'Core'))
      .toEqual({ status: 'rotated', until: '2025-09-05' })
    expect(formatStatus(card({ Core: { allowed: false } }), 'Core')).toEqual({ status: 'not_legal' })
    expect(formatStatus(card({}), 'Infinity')).toEqual({ status: 'not_legal' })
  })

  it('banned beats rotated (Hiram Flaversham)', () => {
    const hiram = card({
      Core: { allowed: false, allowedUntilDate: '2025-04-08', bannedSinceDate: '2025-04-08' },
      Infinity: { allowed: false, bannedSinceDate: '2026-03-26' },
    })
    expect(formatStatus(hiram, 'Core')).toEqual({ status: 'banned', since: '2025-04-08' })
    expect(formatStatus(hiram, 'Infinity')).toEqual({ status: 'banned', since: '2026-03-26' })
  })

  it('Coconut plays the Infinity pool minus its own bans', () => {
    expect(formatStatus(card({ Core: { allowed: true }, Infinity: { allowed: true } }), 'FormatCoconut')).toEqual({ status: 'legal' })
    expect(formatStatus(card({ Infinity: { allowed: true }, FormatCoconut: { allowed: false, bannedSinceDate: '2026-11-03' } }), 'FormatCoconut'))
      .toEqual({ status: 'banned', since: '2026-11-03' })
    expect(formatStatus(card({ Infinity: { allowed: false, bannedSinceDate: '2026-03-26' } }), 'FormatCoconut'))
      .toEqual({ status: 'banned', since: '2026-03-26' })
  })

  it('throws on an unknown format', () => {
    expect(() => formatStatus(card({}), 'Standard')).toThrow('Unknown format')
  })
})

describe('legality', () => {
  it('reports every format in FORMATS order', () => {
    const l = legality(card({ Core: { allowed: true }, Infinity: { allowed: true } }))
    expect(Object.keys(l)).toEqual(FORMATS.map(f => f.key))
    expect(l.FormatCoconut).toEqual({ status: 'legal' })
  })
})

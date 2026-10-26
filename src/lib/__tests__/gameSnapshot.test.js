import { describe, it, expect } from 'vitest'
import { exportSnapshot, parseSnapshot } from '../gameSnapshot'

const game = { p1Name: 'Ibai', p2Name: 'Teagan', log: [], currentTurn: 4 }

describe('gameSnapshot', () => {
  it('round-trips a snapshot through export and parse', () => {
    const text = JSON.stringify(exportSnapshot('abc-123', game, { source: 'test' }))
    expect(parseSnapshot(text)).toEqual({ uuid: 'abc-123', game, exportedAt: expect.any(Number), version: 1 })
  })
  it('accepts a bare game object from an older export', () => {
    expect(parseSnapshot(JSON.stringify(game))).toMatchObject({ uuid: null, game, version: null })
  })
  it('rejects bad JSON and files that are not a game', () => {
    expect(() => parseSnapshot('{nope')).toThrow('Invalid JSON')
    expect(() => parseSnapshot('42')).toThrow('No game data found in file.')
    expect(() => parseSnapshot('{"foo":1}')).toThrow('does not look like a Lorcana game snapshot')
  })
})

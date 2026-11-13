import { describe, it, expect } from 'vitest'
import { videoFilename } from '../tournamentShareImage'

describe('videoFilename', () => {
  it('replaces the extension', () => {
    expect(videoFilename('ana-tournament.jpg')).toBe('ana-tournament-16x9.png')
    expect(videoFilename('x-metagame.png')).toBe('x-metagame-16x9.png')
    expect(videoFilename('deck')).toBe('deck-16x9.png')
  })
})

import { describe, it, expect } from 'vitest'
import { fitInFrame, videoFilename, VIDEO_W, VIDEO_H } from '../tournamentShareImage'

describe('fitInFrame', () => {
  it('fits a tall image by height, centered', () => {
    const r = fitInFrame(1000, 2000)
    expect(r.h).toBeCloseTo(VIDEO_H * 0.9)
    expect(r.w).toBeCloseTo(r.h / 2)
    expect(r.x).toBeCloseTo((VIDEO_W - r.w) / 2)
    expect(r.y).toBeCloseTo(VIDEO_H * 0.05)
  })
  it('fits a wide image by width', () => {
    const r = fitInFrame(4000, 1000)
    expect(r.w).toBeCloseTo(VIDEO_W * 0.9)
    expect(r.h).toBeCloseTo(r.w / 4)
  })
})

describe('videoFilename', () => {
  it('replaces the extension', () => {
    expect(videoFilename('ana-tournament.jpg')).toBe('ana-tournament-16x9.png')
    expect(videoFilename('x-metagame.png')).toBe('x-metagame-16x9.png')
    expect(videoFilename('deck')).toBe('deck-16x9.png')
  })
})

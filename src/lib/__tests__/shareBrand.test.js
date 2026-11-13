import { describe, it, expect } from 'vitest'
import { layout, videoFrame } from '../shareBrand'

describe('layout', () => {
  it('grows with its rows for social images', () => {
    expect(layout({ video: false, w: 1200, top: 236, bottom: 110, n: 15, row: 58 })).toEqual({ W: 1200, H: 236 + 15 * 58 + 110, ROW: 58, dpr: 2 })
  })
  it('makes a 3840x2160 video frame whose rows stop above the webcam band', () => {
    for (const n of [1, 5, 15]) {
      const { W, H, ROW, dpr, cam } = layout({ video: true, w: 1200, top: 236, bottom: 110, n, row: 58, gap: 6 })
      expect(W * dpr).toBeCloseTo(3840)
      expect(H * dpr).toBeCloseTo(2160)
      expect(cam).toEqual({ w: W / 4, h: H / 4 })
      expect(ROW).toBeGreaterThanOrEqual(58 * 0.8 - 1e-9)
      expect(ROW).toBeLessThanOrEqual(58 * 1.3)
      expect(236 + n * (ROW + 6)).toBeLessThanOrEqual(H - cam.h - 24 + 1e-9)
    }
  })
})

describe('videoFrame', () => {
  it('is at least minW wide and tall enough above the webcam band', () => {
    expect(videoFrame(1920, 100)).toMatchObject({ W: 1920, H: 1080, dpr: 2 })
    const f = videoFrame(1200, 1200)
    expect(f.W / f.H).toBeCloseTo(16 / 9)
    expect(f.H - f.cam.h).toBeCloseTo(1200)
  })
})

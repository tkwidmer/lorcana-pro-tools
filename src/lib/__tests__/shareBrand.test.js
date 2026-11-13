import { describe, it, expect } from 'vitest'
import { layout, frame } from '../shareBrand'

describe('frame', () => {
  it('makes a 4:5 social frame rendered 2160x2700, at least minW wide and minH tall', () => {
    expect(frame(false, 1200, 100)).toMatchObject({ W: 1200, H: 1500, dpr: 1.8, cam: null })
    const f = frame(false, 1200, 2000)
    expect(f.W / f.H).toBeCloseTo(4 / 5)
    expect(f.H).toBeCloseTo(2000)
    expect(f.W * f.dpr).toBeCloseTo(2160)
  })
  it('makes a 16:9 video frame rendered 3840x2160 with minH above the webcam band', () => {
    expect(frame(true, 1920, 100)).toMatchObject({ W: 1920, H: 1080, dpr: 2 })
    const f = frame(true, 1200, 1200)
    expect(f.W / f.H).toBeCloseTo(16 / 9)
    expect(f.H - f.cam.h).toBeCloseTo(1200)
    expect(f.cam).toEqual({ w: f.W / 4, h: f.H / 4 })
  })
})

describe('layout', () => {
  for (const video of [false, true]) {
    it(`fits n rows between the header and the ${video ? 'webcam band' : 'footer'}`, () => {
      for (const n of [1, 5, 15, 40]) {
        const { W, H, ROW, dpr, cam } = layout({ video, w: 1200, top: 236, bottom: 110, n, row: 58, gap: 6 })
        expect(W * dpr).toBeCloseTo(video ? 3840 : 2160)
        expect(H * dpr).toBeCloseTo(video ? 2160 : 2700)
        expect(ROW).toBeGreaterThanOrEqual(58 * 0.8 - 1e-9)
        expect(ROW).toBeLessThanOrEqual(58 * 1.3)
        expect(236 + n * (ROW + 6)).toBeLessThanOrEqual((video ? H - cam.h - 24 : H - 110) + 1e-9)
      }
    })
  }
  it('lets rows stretch up to maxRow', () => {
    expect(layout({ video: false, w: 1200, top: 236, bottom: 110, n: 2, row: 58, maxRow: 2 }).ROW).toBe(116)
  })
})

import { describe, it, expect } from 'vitest'
import { gridFit } from '../coconutShareImage'

describe('gridFit', () => {
  it('picks the column count that gives the biggest cells and fits them', () => {
    const f = gridFit(60, 1300, 590, 8, 1.4)
    expect(f.cols * f.rows).toBeGreaterThanOrEqual(60)
    expect(f.cols * f.cellW + (f.cols - 1) * 8).toBeLessThanOrEqual(1300 + 1e-9)
    expect(f.rows * f.cellH + (f.rows - 1) * 8).toBeLessThanOrEqual(590 + 1e-9)
    for (let cols = 1; cols <= 60; cols++) {
      const rows = Math.ceil(60 / cols)
      expect(Math.min((1300 - 8 * (cols - 1)) / cols, (590 - 8 * (rows - 1)) / rows / 1.4)).toBeLessThanOrEqual(f.cellW + 1e-9)
    }
  })
  it('handles an empty deck', () => {
    expect(gridFit(0, 100, 100, 8, 1.4).cols).toBe(1)
  })
})

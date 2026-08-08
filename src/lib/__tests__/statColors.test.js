import { describe, it, expect } from 'vitest'
import {
  winrateCellColor,
  winrateTextColor,
  deltaColor,
  oddsColor,
  brickGrade,
  brickGradeColor,
  brickRiskColor,
  brickBarColor,
} from '../statColors'

describe('winrateCellColor', () => {
  it('buckets non-mirror win rates green/gray/red by threshold', () => {
    expect(winrateCellColor(60)).toBe('bg-green-300 border border-green-500')
    expect(winrateCellColor(55)).toBe('bg-green-200 border border-green-400')
    expect(winrateCellColor(51)).toBe('bg-green-100 border border-green-300')
    expect(winrateCellColor(49)).toBe('bg-gray-50 border border-gray-200')
    expect(winrateCellColor(45)).toBe('bg-red-100 border border-red-300')
    expect(winrateCellColor(40)).toBe('bg-red-200 border border-red-400')
    expect(winrateCellColor(10)).toBe('bg-red-300 border border-red-500')
  })

  it('uses a blue scale for mirror matchups', () => {
    expect(winrateCellColor(60, true)).toBe('bg-blue-300 border border-blue-500')
    expect(winrateCellColor(55, true)).toBe('bg-blue-200 border border-blue-400')
    expect(winrateCellColor(51, true)).toBe('bg-blue-100 border border-blue-300')
    expect(winrateCellColor(10, true)).toBe('bg-gray-50 border border-gray-200')
  })
})

describe('winrateTextColor', () => {
  it('handles null/NaN as unknown', () => {
    expect(winrateTextColor(null)).toBe('text-gray-400')
    expect(winrateTextColor(NaN)).toBe('text-gray-400')
  })

  it('buckets by threshold', () => {
    expect(winrateTextColor(60)).toBe('text-green-700 font-semibold')
    expect(winrateTextColor(52)).toBe('text-green-600')
    expect(winrateTextColor(48)).toBe('text-gray-700')
    expect(winrateTextColor(40)).toBe('text-red-600')
    expect(winrateTextColor(10)).toBe('text-red-700 font-semibold')
  })
})

describe('deltaColor', () => {
  it('treats null as unknown, and small deltas as neutral', () => {
    expect(deltaColor(null)).toBe('text-gray-400')
    expect(deltaColor(0)).toBe('text-gray-500')
    expect(deltaColor(4.9)).toBe('text-gray-500')
    expect(deltaColor(-4.9)).toBe('text-gray-500')
  })

  it('flags large positive/negative deltas', () => {
    expect(deltaColor(5)).toBe('text-green-700')
    expect(deltaColor(-5)).toBe('text-red-700')
  })
})

describe('oddsColor', () => {
  it('buckets a 0-1 probability', () => {
    expect(oddsColor(0.75)).toBe('text-green-700')
    expect(oddsColor(0.5)).toBe('text-yellow-700')
    expect(oddsColor(0.25)).toBe('text-orange-600')
    expect(oddsColor(0)).toBe('text-red-600')
  })
})

describe('brickGrade / brickGradeColor', () => {
  it('assigns letter grades by risk threshold', () => {
    expect(brickGrade(0.02)).toBe('A')
    expect(brickGrade(0.05)).toBe('B')
    expect(brickGrade(0.1)).toBe('C')
    expect(brickGrade(0.2)).toBe('D')
    expect(brickGrade(0.5)).toBe('F')
  })

  it('maps each grade to a color', () => {
    expect(brickGradeColor('A')).toBe('text-green-600')
    expect(brickGradeColor('B')).toBe('text-emerald-600')
    expect(brickGradeColor('C')).toBe('text-yellow-600')
    expect(brickGradeColor('D')).toBe('text-orange-500')
    expect(brickGradeColor('F')).toBe('text-red-600')
  })
})

describe('brickRiskColor / brickBarColor', () => {
  it('buckets risk on the same thresholds as brickGrade (A/B/C, else red)', () => {
    expect(brickRiskColor(0.02)).toBe('text-green-600')
    expect(brickRiskColor(0.05)).toBe('text-yellow-600')
    expect(brickRiskColor(0.1)).toBe('text-orange-500')
    expect(brickRiskColor(0.3)).toBe('text-red-600')

    expect(brickBarColor(0.02)).toBe('bg-green-400')
    expect(brickBarColor(0.05)).toBe('bg-yellow-400')
    expect(brickBarColor(0.1)).toBe('bg-orange-400')
    expect(brickBarColor(0.3)).toBe('bg-red-500')
  })
})

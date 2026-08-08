import { describe, it, expect } from 'vitest'
import {
  buildMCDeck,
  mcSim,
  curveProbMC,
  uninkableRiskMC,
  deadDrawRiskMC,
  questPressureSim,
  SIM_TURNS,
} from '../monteCarloSim'

describe('buildMCDeck + mcSim', () => {
  it('finds the target with certainty when every card in the deck is a target', () => {
    const cards = [{ name: 'Elsa', count: 60 }]
    const deck = buildMCDeck(60, cards, ['Elsa'], false, [])
    const p = mcSim({ ...deck, N: 60, M: 0, T: 0, need: 1 })
    expect(p).toBe(1)
  })

  it('never finds the target when no card in the deck is a target', () => {
    const cards = [{ name: 'Elsa', count: 60 }]
    const deck = buildMCDeck(60, cards, ['Mickey'], false, [])
    const p = mcSim({ ...deck, N: 60, M: 0, T: 0, need: 1 })
    expect(p).toBe(0)
  })
})

describe('curveProbMC', () => {
  it('is 100% for every turn when every card costs 0', () => {
    const N = 60
    const deckCosts = new Int32Array(N).fill(0)
    const result = curveProbMC(deckCosts, N, 0, false, 0, 200)
    expect(result).toHaveLength(8)
    for (const p of result) expect(p).toBe(1)
  })

  it('is 0% for every turn when no card is ever cheap enough', () => {
    const N = 60
    const deckCosts = new Int32Array(N).fill(99)
    const result = curveProbMC(deckCosts, N, 0, false, 0, 200)
    for (const p of result) expect(p).toBe(0)
  })
})

describe('uninkableRiskMC', () => {
  it('is 0 risk when every card is inkable', () => {
    const N = 60
    const deckInkable = new Uint8Array(N).fill(1)
    expect(uninkableRiskMC(deckInkable, N, 2, 200)).toBe(0)
  })

  it('is certain risk when no card is inkable and mulligan cannot fix it', () => {
    const N = 60
    const deckInkable = new Uint8Array(N).fill(0)
    expect(uninkableRiskMC(deckInkable, N, 0, 200)).toBe(1)
  })
})

describe('deadDrawRiskMC', () => {
  it('never misses when every card is at or below the cost threshold', () => {
    const N = 60
    const deckCosts = new Int32Array(N).fill(1)
    expect(deadDrawRiskMC(deckCosts, N, 3, 0, 200)).toBe(0)
  })

  it('always misses when no card meets the threshold and there is no mulligan', () => {
    const N = 60
    const deckCosts = new Int32Array(N).fill(99)
    expect(deadDrawRiskMC(deckCosts, N, 3, 0, 200)).toBe(1)
  })
})

describe('questPressureSim', () => {
  it('returns a zeroed/never-win shape for an empty deck', () => {
    const result = questPressureSim([], false, 0, 100)
    expect(result.avgLore).toEqual(new Array(SIM_TURNS).fill(0))
    expect(result.neverWinRate).toBe(1)
    expect(result.estWinTurn).toBeNull()
    expect(result.medianWinTurn).toBeNull()
  })

  it('accumulates lore over turns for a deck of cheap questing characters', () => {
    const deckCards = Array.from({ length: 60 }, () => ({
      type: 'Character', cost: 1, lore: 1, inkwell: true,
    }))
    const result = questPressureSim(deckCards, false, 0, 100)
    expect(result.avgLore).toHaveLength(SIM_TURNS)
    // Lore should be non-decreasing turn over turn.
    for (let i = 1; i < result.avgLore.length; i++) {
      expect(result.avgLore[i]).toBeGreaterThanOrEqual(result.avgLore[i - 1])
    }
    expect(result.avgLore[SIM_TURNS - 1]).toBeGreaterThan(0)
  })
})

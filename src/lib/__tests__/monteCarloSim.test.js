import { describe, it, expect } from 'vitest'
import {
  buildMCDeck,
  buildMCJointDeckN,
  mcSim,
  mcJointSimN,
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
    const p = mcSim({ ...deck, N: 60, M: 0, targetTurn: 0, need: 1 })
    expect(p).toBe(1)
  })

  it('never finds the target when no card in the deck is a target', () => {
    const cards = [{ name: 'Elsa', count: 60 }]
    const deck = buildMCDeck(60, cards, ['Mickey'], false, [])
    const p = mcSim({ ...deck, N: 60, M: 0, targetTurn: 0, need: 1 })
    expect(p).toBe(0)
  })

  it('is deterministic — identical inputs produce identical output across repeated calls', () => {
    const cards = [
      { name: 'Grandmother Willow', count: 4 },
      { name: 'Hamm', count: 4 },
      { name: 'Besties', count: 4 },
      { name: 'Filler', count: 48 },
    ]
    const scrySources = [{ name: 'Besties', copies: 4, lookAt: 4, keep: 1 }]
    const runOnce = () => {
      const deck = buildMCDeck(60, cards, ['Grandmother Willow', 'Hamm'], true, scrySources)
      return mcSim({ ...deck, N: 60, M: 3, targetTurn: 2, need: 1 })
    }
    const p1 = runOnce()
    const p2 = runOnce()
    expect(p1).toBe(p2)
  })

  it('a strictly better scry source (more looks) never scores lower than a weaker one at the same mulligan count', () => {
    const cards = [
      { name: 'Grandmother Willow', count: 4 },
      { name: 'Hamm', count: 4 },
      { name: 'Scryer', count: 4 },
      { name: 'Filler', count: 48 },
    ]
    for (const m of [0, 3, 7]) {
      const weakDeck = buildMCDeck(60, cards, ['Grandmother Willow', 'Hamm'], false, [{ name: 'Scryer', copies: 4, lookAt: 2, keep: 1 }])
      const strongDeck = buildMCDeck(60, cards, ['Grandmother Willow', 'Hamm'], false, [{ name: 'Scryer', copies: 4, lookAt: 4, keep: 1 }])
      const pWeak = mcSim({ ...weakDeck, N: 60, M: m, targetTurn: 3, need: 1 })
      const pStrong = mcSim({ ...strongDeck, N: 60, M: m, targetTurn: 3, need: 1 })
      expect(pStrong).toBeGreaterThanOrEqual(pWeak)
    }
  })

  it('mulliganMode "keep" always keeps the scry source card in the opening hand through mulligan', () => {
    // A deck where the scry source is the ONLY card that can trigger the scry — if it's
    // always kept, the look/keep effect should always fire; if not forced, it can be
    // mulliganed away like any other non-target card.
    const cards = [
      { name: 'Target', count: 1 },
      { name: 'Scryer', count: 1 },
      { name: 'Filler', count: 58 },
    ]
    const deck = buildMCDeck(60, cards, ['Target'], false, [{ name: 'Scryer', copies: 1, lookAt: 10, keep: 1, mulliganMode: 'keep' }])
    // isKeep should be set for the scry source position even though it isn't a group target.
    const scryIdx = 1 // Target(1) then Scryer(1)
    expect(deck.isKeep[scryIdx]).toBe(1)
  })

  it('mulliganMode "mulligan" forces the scry source out of the kept hand even if it would otherwise be kept', () => {
    const cards = [{ name: 'Scryer', count: 60 }]
    // Scryer is also the group target, so it'd normally be force-kept when need>1's partial-progress
    // rule or keepInMulligan applies — mulliganMode 'mulligan' should override that.
    const deck = buildMCDeck(60, cards, ['Scryer'], true, [{ name: 'Scryer', copies: 60, lookAt: 1, keep: 1, mulliganMode: 'mulligan' }])
    expect(deck.scryForceMulligan[0]).toBe(1)
  })

  it('a scry source too expensive to cast on the target turn provides no boost over no scry at all', () => {
    // Going first, turn 2 gives you 2 ink, so a cost-3 scry source can never be cast in time
    // — the effect is fully gated off and, thanks to common random numbers, the result is
    // bit-identical to the no-scry baseline rather than merely close to it.
    const cards = [
      { name: 'Target', count: 4 },
      { name: 'Scryer', count: 4 },
      { name: 'Filler', count: 52 },
    ]
    const withScry = buildMCDeck(60, cards, ['Target'], false, [{ name: 'Scryer', copies: 4, lookAt: 10, keep: 4, cost: 3 }])
    const noScry = buildMCDeck(60, cards, ['Target'], false, [])
    for (const m of [0, 3, 7]) {
      const pWith = mcSim({ ...withScry, N: 60, M: m, targetTurn: 2, need: 1, goingFirst: true, additionalDraws: 0 })
      const pWithout = mcSim({ ...noScry, N: 60, M: m, targetTurn: 2, need: 1, goingFirst: true, additionalDraws: 0 })
      expect(pWith).toBe(pWithout)
    }
  })

  it('a cheap scry source boosts odds once its turn is reached, but a same-config expensive one does not', () => {
    const cards = [
      { name: 'Target', count: 4 },
      { name: 'Scryer', count: 4 },
      { name: 'Filler', count: 52 },
    ]
    const cheapDeck = buildMCDeck(60, cards, ['Target'], false, [{ name: 'Scryer', copies: 4, lookAt: 10, keep: 4, cost: 1 }])
    const expensiveDeck = buildMCDeck(60, cards, ['Target'], false, [{ name: 'Scryer', copies: 4, lookAt: 10, keep: 4, cost: 6 }])
    const pCheap = mcSim({ ...cheapDeck, N: 60, M: 0, targetTurn: 3, need: 1, goingFirst: false, additionalDraws: 0 })
    const pExpensive = mcSim({ ...expensiveDeck, N: 60, M: 0, targetTurn: 3, need: 1, goingFirst: false, additionalDraws: 0 })
    expect(pCheap).toBeGreaterThan(pExpensive)
  })

  it('fires a scry source sitting in the OPENING HAND, not only one drawn off the top', () => {
    // The whole point of a cheap scry source is that you play it from your opener. A deck
    // where the scry source is guaranteed in the opening 7 (and no target can be drawn
    // naturally in time) must still find targets purely through the scry.
    const cards = [
      { name: 'Scryer', count: 53 },
      { name: 'Target', count: 7 },
    ]
    const deck = buildMCDeck(60, cards, ['Target'], false, [{ name: 'Scryer', copies: 4, lookAt: 10, keep: 1, cost: 1 }])
    // Turn 1 going first draws nothing at all, so any hit must come from the scry itself.
    const p = mcSim({ ...deck, N: 60, M: 0, targetTurn: 1, need: 1, goingFirst: true, additionalDraws: 0 })
    expect(p).toBeGreaterThan(0.5)
  })

  it('keeping a scry source through the mulligan beats tossing it', () => {
    // With a full mulligan and no target in the opener, a Toss-flagged scry source is always
    // shipped back, while a Keep-flagged one survives to be played and dig for the target.
    const cards = [
      { name: 'Target', count: 4 },
      { name: 'Scryer', count: 4 },
      { name: 'Filler', count: 52 },
    ]
    const keepDeck = buildMCDeck(60, cards, ['Target'], false, [{ name: 'Scryer', copies: 4, lookAt: 5, keep: 1, cost: 1, mulliganMode: 'keep' }])
    const tossDeck = buildMCDeck(60, cards, ['Target'], false, [{ name: 'Scryer', copies: 4, lookAt: 5, keep: 1, cost: 1, mulliganMode: 'mulligan' }])
    const pKeep = mcSim({ ...keepDeck, N: 60, M: 7, targetTurn: 2, need: 1, goingFirst: true, additionalDraws: 0 })
    const pToss = mcSim({ ...tossDeck, N: 60, M: 7, targetTurn: 2, need: 1, goingFirst: true, additionalDraws: 0 })
    expect(pKeep).toBeGreaterThan(pToss)
  })

  it('adding a usable scry source strictly improves the odds over the same deck without one', () => {
    const cards = [
      { name: 'Target', count: 4 },
      { name: 'Scryer', count: 4 },
      { name: 'Filler', count: 52 },
    ]
    const withScry = buildMCDeck(60, cards, ['Target'], false, [{ name: 'Scryer', copies: 4, lookAt: 4, keep: 1, cost: 1, mulliganMode: 'keep' }])
    const noScry = buildMCDeck(60, cards, ['Target'], false, [])
    const pWith = mcSim({ ...withScry, N: 60, M: 0, targetTurn: 2, need: 1, goingFirst: true, additionalDraws: 0 })
    const pWithout = mcSim({ ...noScry, N: 60, M: 0, targetTurn: 2, need: 1, goingFirst: true, additionalDraws: 0 })
    // Look 4 keep 1 off a 4-of scry source is worth several points, well clear of noise.
    expect(pWith).toBeGreaterThan(pWithout + 0.03)
  })

  it('group "always keep" is a no-op at need=1 and returns an identical number, not a wobble', () => {
    // The mulligan only runs when the opener MISSED, so at need=1 there is never a target in
    // hand for "always keep" to protect. Under common random numbers that must come back
    // bit-identical — previously it resampled and moved the displayed percentage by ~1%.
    const cards = [
      { name: 'Target', count: 8 },
      { name: 'Filler', count: 52 },
    ]
    const keepDeck = buildMCDeck(60, cards, ['Target'], true, [])
    const noKeepDeck = buildMCDeck(60, cards, ['Target'], false, [])
    for (const m of [0, 3, 7]) {
      const pKeep = mcSim({ ...keepDeck, N: 60, M: m, targetTurn: 2, need: 1, goingFirst: true })
      const pNoKeep = mcSim({ ...noKeepDeck, N: 60, M: m, targetTurn: 2, need: 1, goingFirst: true })
      expect(pKeep).toBe(pNoKeep)
    }
  })

  it('is monotonic in mulligan count for a fixed configuration', () => {
    const cards = [
      { name: 'Target', count: 8 },
      { name: 'Filler', count: 52 },
    ]
    const deck = buildMCDeck(60, cards, ['Target'], false, [])
    let prev = 0
    for (let m = 0; m <= 7; m++) {
      const p = mcSim({ ...deck, N: 60, M: m, targetTurn: 2, need: 1, goingFirst: true })
      expect(p).toBeGreaterThanOrEqual(prev - 0.005)
      prev = p
    }
  })
})


describe('buildMCJointDeckN + mcJointSimN determinism', () => {
  it('is deterministic across repeated calls with identical inputs', () => {
    const cards = [
      { name: 'A', count: 4 },
      { name: 'B', count: 4 },
      { name: 'Besties', count: 4 },
      { name: 'Filler', count: 48 },
    ]
    const groups = [
      { id: 1, cardNames: ['A'], keepInMulligan: false, need: 1 },
      { id: 2, cardNames: ['B'], keepInMulligan: false, need: 1 },
    ]
    const scrySources = [{ name: 'Besties', copies: 4, lookAt: 4, keep: 1 }]
    const runOnce = () => {
      const deck = buildMCJointDeckN(60, cards, groups, scrySources)
      return mcJointSimN({ ...deck, N: 60, M: 3, targetTurns: [2, 2], needs: [1, 1] })
    }
    expect(runOnce()).toBe(runOnce())
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

describe('scry source wiring', () => {
  const N = 60
  const cards = [{ name: 'T', count: 8 }, { name: 'S', count: 4 }, { name: 'F', count: 48 }]

  it('can find the scry source via mulligan replacements, not just the opener', () => {
    // Turn 1 going first draws nothing, so every hit must come from a scry played out of
    // hand. More mulligan => more chances to turn up the scry source => strictly better.
    const deck = buildMCDeck(N, cards, ['T'], false,
      [{ name: 'S', lookAt: 20, keep: 1, cost: 1, mulliganMode: 'keep' }])
    const run = M => mcSim({ ...deck, N, M, targetTurn: 1, need: 1, goingFirst: true, iters: 50000 })
    const p0 = run(0), p3 = run(3), p7 = run(7)
    expect(p3).toBeGreaterThan(p0)
    expect(p7).toBeGreaterThan(p3)
  })

  it('takes the copy count from the deck list, not from the scry entry', () => {
    // "Copies" used to be a separate input that the simulation ignored entirely.
    const a = buildMCDeck(N, cards, ['T'], false, [{ name: 'S', lookAt: 6, keep: 1, cost: 1 }])
    const flagged = [...a.scryLookAt].filter(v => v > 0).length
    expect(flagged).toBe(4) // the deck list's count for 'S'
  })

  it('respects scryKeep — keeping 1 of N revealed is worse than keeping all of them', () => {
    // need 2 so the keep cap actually binds.
    const mk = keep => buildMCDeck(N, cards, ['T'], false,
      [{ name: 'S', lookAt: 8, keep, cost: 1, mulliganMode: 'keep' }])
    const run = d => mcSim({ ...d, N, M: 0, targetTurn: 2, need: 2, goingFirst: true, iters: 50000 })
    expect(run(mk(8))).toBeGreaterThan(run(mk(1)))
  })

  it('converges to the exact closed form when no scry is configured', async () => {
    const { drawOdds } = await import('../drawOddsMath')
    const deck = buildMCDeck(N, [{ name: 'T', count: 4 }, { name: 'F', count: 56 }], ['T'], false, [])
    for (const [M, T, gf] of [[0, 4, false], [3, 2, true], [7, 3, false]]) {
      const draws = (gf ? Math.max(0, T - 1) : T)
      const mc = mcSim({ ...deck, N, M, targetTurn: T, need: 1, goingFirst: gf, iters: 400000 })
      expect(Math.abs(mc - drawOdds(N, 4, M, draws))).toBeLessThan(0.005)
    }
  })
})

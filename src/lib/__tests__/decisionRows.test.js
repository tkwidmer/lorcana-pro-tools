import { describe, it, expect } from 'vitest'
import { decisionRows, deckShape } from '../decisionRows'

const entry = (type, player, turnNumber, data = {}) => ({ type, player, turnNumber, data })
const cards = {
  A: { cost: 1, inkwell: true, type: 'Character', strength: 1, willpower: 2, lore: 1 },
  B: { cost: 5, inkwell: false, type: 'Action' },
  C: { cost: 2, inkwell: true, type: 'Item' },
  D: { cost: 3, inkwell: true, type: 'Character', keywordAbilities: ['Shift'] },
}
const ME = 1
const DECK = [{ cardId: 'A', count: 4 }, { cardId: 'C', count: 4 }]
// Opening hand A A B, mulligan one A for a C: the hand is A B C.
const opening = [
  entry('INITIAL_HAND', ME, 1, { initialHandCards: [{ id: 'A' }, { id: 'A' }, { id: 'B' }] }),
  entry('MULLIGAN', ME, 1, { mulliganedCards: [{ id: 'A' }], drawnCards: [{ id: 'C' }] }),
]
const discardPrompt = (offered, selected, player = ME) => [
  entry('CHOICE_RESOLVED', ME, 3, { choice: { message: 'chooseCardToDiscard', offered: offered.map(([cardId, instanceId]) => ({ cardId, instanceId })), selectedInstanceIds: [selected] } }),
  entry('CARD_DISCARDED', player, 3, { cardId: offered.find(o => o[1] === selected)[0], instanceId: selected, fromZone: 'hand' }),
]

describe('decisionRows', () => {
  it('labels each opening-hand card kept or sent, kept copies first', () => {
    const { mulligan } = decisionRows(opening, ME, cards, DECK)
    expect(mulligan.map(r => [r.card_id, r.copy, r.kept])).toEqual([['A', 1, 1], ['A', 2, 0], ['B', 1, 1]])
    expect(mulligan[0]).toMatchObject({ copies: 2, hand_inkable: 2, hand_cost_le2: 2, hand_cost_ge5: 1 })
  })

  it('offers every inkable card in hand at an ink, and passes all of them over on a turn with no ink', () => {
    const { ink } = decisionRows([
      ...opening,
      entry('TURN_START', ME, 1), entry('CARD_INKED', ME, 1, { cardId: 'C' }), entry('TURN_END', ME, 1),
      entry('TURN_START', ME, 2), entry('TURN_DRAW', ME, 2), entry('CARD_DRAWN', ME, 2, { cardId: 'D', instanceId: 'd1' }), entry('TURN_END', ME, 2),
    ], ME, cards, DECK)
    expect(ink.filter(r => r.decision === 0).map(r => [r.card_id, r.inked, r.ink, r.cost_gap])).toEqual([['A', 0, 0, 0], ['C', 1, 0, 1]])
    expect(ink.filter(r => r.decision === 1).map(r => [r.card_id, r.inked, r.no_ink, r.ink, r.shift])).toEqual([['A', 0, 1, 1, 0], ['D', 0, 1, 1, 1]])
  })

  it('stops emitting after an undo and resumes once a full-hand prompt shows the hand', () => {
    const { ink, checks } = decisionRows([
      ...opening,
      entry('TURN_START', ME, 1), entry('CARD_INKED', ME, 1, { cardId: 'C' }), entry('FREE_UNDO', ME, 1), entry('CARD_INKED', ME, 1, { cardId: 'A' }), entry('TURN_END', ME, 1),
      entry('TURN_START', ME, 3),
      // Tod-style: the two draws are logged after the prompt that already lists them; the discard is logged twice.
      ...discardPrompt([['B', 'b1'], ['C', 'c1'], ['D', 'd1'], ['A', 'a2']], 'a2'),
      entry('CARD_DRAWN', ME, 3, { cardId: 'D', instanceId: 'd1' }), entry('CARD_DRAWN', ME, 3, { cardId: 'A', instanceId: 'a2' }),
      entry('CARD_DISCARDED', ME, 3, { cardId: 'A', instanceId: 'a2', fromZone: 'hand' }),
      entry('CARD_INKED', ME, 3, { cardId: 'D' }), entry('TURN_END', ME, 3),
    ], ME, cards, DECK)
    expect(new Set(ink.map(r => r.turn))).toEqual(new Set([3]))
    expect(ink.map(r => [r.card_id, r.inked, r.hand_size])).toEqual([['C', 0, 3], ['D', 1, 3]])
    expect(checks).toMatchObject({ undos: 1, inkDecisions: 3, certainInkDecisions: 1 })
  })

  it('ignores discard prompts over the opponent\'s hand', () => {
    const { checks } = decisionRows([...opening, ...discardPrompt([['X', 'x1']], 'x1', 2)], ME, cards, DECK)
    expect(checks.checkpoints).toBe(0)
  })

  it('counts what the opponent has shown before each ink, by type and by cards shared with the deck', () => {
    const { ink } = decisionRows([
      ...opening,
      entry('CARD_PLAYED', 2, 1, { cardId: 'C' }), entry('CARD_INKED', 2, 1, { cardId: 'B' }), entry('CARD_DRAWN', 2, 1, {}),
      entry('TURN_START', ME, 2), entry('CARD_INKED', ME, 2, { cardId: 'C' }), entry('TURN_END', ME, 2),
      entry('CARD_PLAYED', 2, 2, { cardId: 'A' }),
    ], ME, cards, DECK)
    expect(ink[0]).toMatchObject({ opp_items: 1, opp_actions: 1, opp_characters: 0, opp_shared: 1 })
  })

  it('describes the deck\'s shape from its list', () => {
    expect(deckShape([{ cardId: 'A', count: 3 }, { cardId: 'B', count: 1 }], cards))
      .toEqual({ deck_inkable: 3, deck_avg_cost: 2, deck_cost_ge5: 1, deck_items: 0, deck_actions: 1 })
  })

  it('counts a play of a card not in hand as drift unless a prompt beside it offered that card', () => {
    const fromDiscard = decisionRows([
      ...opening,
      entry('CARD_PLAYED', ME, 2, { cardId: 'D' }),
      entry('CHOICE_RESOLVED', ME, 2, { choice: { message: 'chooseCardFromDiscard', offered: [{ cardId: 'D', instanceId: 'd9' }] } }),
    ], ME, cards, DECK)
    expect(fromDiscard.checks.misses).toBe(0)
    expect(decisionRows([...opening, entry('CARD_PLAYED', ME, 2, { cardId: 'D' })], ME, cards, DECK).checks.misses).toBe(1)
  })
})

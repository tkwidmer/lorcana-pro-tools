import { describe, it, expect } from 'vitest'
import { parseColors, parseGamelog } from '../parseGamelog'

describe('parseColors', () => {
  it('splits slash-separated color strings', () => {
    expect(parseColors('ruby/sapphire')).toEqual(['ruby', 'sapphire'])
  })
  it('normalizes to lowercase', () => {
    expect(parseColors('Ruby/SAPPHIRE')).toEqual(['ruby', 'sapphire'])
  })
  it('handles single color', () => {
    expect(parseColors('amber')).toEqual(['amber'])
  })
  it('returns empty array for falsy input', () => {
    expect(parseColors(null)).toEqual([])
    expect(parseColors('')).toEqual([])
  })
})

// Minimal log entry factory
const entry = (type, player, turnNumber, data = {}) => ({ type, player, turnNumber, data })

describe('parseGamelog - basic structure', () => {
  it('returns empty game for empty logs', () => {
    const result = parseGamelog('test-1', [], {})
    expect(result.id).toBe('test-1')
    expect(result.winner).toBeNull()
    expect(result.turnCount).toBe(0)
    expect(result.eventCount).toBe(0)
    expect(result.challenges).toEqual([])
  })

  it('captures turn count from highest turnNumber', () => {
    const logs = [
      entry('TURN_START', 1, 1),
      entry('TURN_START', 2, 2),
      entry('TURN_START', 1, 3),
    ]
    const result = parseGamelog('x', logs, {})
    expect(result.turnCount).toBe(3)
  })

  it('records GAME_END winner', () => {
    const logs = [entry('GAME_END', null, 5, { winner: 1 })]
    const result = parseGamelog('x', logs, {})
    expect(result.winner).toBe(1)
  })

  it('records GAME_CONCEDED winner and victoryReason', () => {
    const logs = [entry('GAME_CONCEDED', null, 4, { winner: 2, victoryReason: 'concession', concededBy: 1 })]
    const result = parseGamelog('x', logs, {})
    expect(result.winner).toBe(2)
    expect(result.victoryReason).toBe('concession')
    expect(result.concededBy).toBe(1)
  })
})

describe('parseGamelog - card tracking', () => {
  it('tracks CARD_DRAWN, CARD_PLAYED, CARD_INKED counts', () => {
    const logs = [
      entry('CARD_DRAWN', 1, 1, { cardName: 'Elsa', cardId: '1-1' }),
      entry('CARD_PLAYED', 1, 1, { cardName: 'Elsa', cardId: '1-1' }),
      entry('CARD_INKED', 1, 2, { cardName: 'Mickey', cardId: '1-2' }),
    ]
    const result = parseGamelog('x', logs, {})
    const elsaP1 = result.p1.cards['Elsa']
    expect(elsaP1.drawn).toBe(1)
    expect(elsaP1.played).toBe(1)
    const mickeyP1 = result.p1.cards['Mickey']
    expect(mickeyP1.inked).toBe(1)
  })

  it('attributes effectRemovals when CARD_PUT_INTO_INKWELL from field', () => {
    // Player 2 plays a card, then player 1's card is moved to inkwell from field
    const logs = [
      entry('CARD_PLAYED', 2, 1, { cardName: 'Hades', cardId: '2-1' }),
      entry('CARD_PUT_INTO_INKWELL', 1, 1, { cardName: 'Elsa', cardId: '1-1', fromZone: 'field' }),
    ]
    const result = parseGamelog('x', logs, {})
    expect(result.p2.cards['Hades'].effectRemovals).toBe(1)
  })

  it('does not attribute effectRemovals when CARD_PUT_INTO_INKWELL from hand', () => {
    const logs = [
      entry('CARD_PLAYED', 2, 1, { cardName: 'Hades', cardId: '2-1' }),
      entry('CARD_PUT_INTO_INKWELL', 1, 1, { cardName: 'Elsa', cardId: '1-1', fromZone: 'hand' }),
    ]
    const result = parseGamelog('x', logs, {})
    // Hades was last played by p2 but fromZone=hand → inking voluntarily, no effectRemoval
    expect(result.p2.cards['Hades']?.effectRemovals ?? 0).toBe(0)
  })

  it('tracks lore gains and final lore totals', () => {
    const logs = [
      entry('CARD_QUEST', 1, 2, { cardName: 'Elsa', cardId: '1-1', loreGained: 3, newLoreTotal: 3 }),
      entry('CARD_QUEST', 1, 3, { cardName: 'Elsa', cardId: '1-1', loreGained: 3, newLoreTotal: 6 }),
    ]
    const result = parseGamelog('x', logs, {})
    expect(result.p1FinalLore).toBe(6)
    expect(result.p1.cards['Elsa'].loreGained).toBe(6)
    expect(result.loreEvents).toHaveLength(2)
  })

  it('records challenge data only on the event with attackerBanished defined', () => {
    const logs = [
      // First event (no banished info) — should be ignored
      entry('CARD_ATTACK', 1, 3, { cardName: 'Attacker', targetCardName: 'Defender' }),
      // Second event (full combat) — should be recorded
      entry('CARD_ATTACK', 1, 3, {
        cardName: 'Attacker', targetCardName: 'Defender',
        attackerBanished: true, defenderBanished: false,
        attackerBaseStrength: 2, defenderBaseStrength: 3,
        attackerWillpower: 2, defenderWillpower: 4,
      }),
    ]
    const result = parseGamelog('x', logs, {})
    expect(result.challenges).toHaveLength(1)
    expect(result.challenges[0].attackerBanished).toBe(true)
    expect(result.challenges[0].defenderBanished).toBe(false)
  })
})

describe('parseGamelog - meta fields', () => {
  it('derives player names from meta', () => {
    const logs = [entry('GAME_END', null, 5, { winner: 1 })]
    const result = parseGamelog('x', logs, {
      yourPlayerNum: 1,
      yourDisplayName: 'Alice',
      opponentName: 'Bob',
    })
    expect(result.p1Name).toBe('Alice')
    expect(result.p2Name).toBe('Bob')
  })

  it('derives myPlayerNum from win/loss fallback', () => {
    const logs = [entry('GAME_END', null, 5, { winner: 2 })]
    const result = parseGamelog('x', logs, { yourResult: 'win' })
    expect(result.myPlayerNum).toBe(2)
  })

  it('captures ink colors from meta', () => {
    const logs = []
    const result = parseGamelog('x', logs, { yourColors: 'ruby/sapphire', oppColors: 'amber/steel' })
    expect(result.myInkCombo).toEqual(['ruby', 'sapphire'])
    expect(result.oppInkCombo).toEqual(['amber', 'steel'])
  })

  it('builds turn segments from TURN_START events', () => {
    const logs = [
      entry('TURN_START', 1, 1),
      entry('CARD_INKED', 1, 1, { cardName: 'X' }),
      entry('TURN_START', 2, 2),
      entry('CARD_PLAYED', 2, 2, { cardName: 'Y' }),
    ]
    const result = parseGamelog('x', logs, {})
    expect(result.turns).toHaveLength(2)
    expect(result.turns[0]).toMatchObject({ owner: 1, inked: 1, plays: 0 })
    expect(result.turns[1]).toMatchObject({ owner: 2, plays: 1 })
  })
})

describe('parseGamelog - inferred decklist', () => {
  it('builds inferred decklist from CARD_DRAWN instanceIds', () => {
    const logs = [
      // Player 2 (the opponent of player 1) draws cards
      entry('CARD_DRAWN', 2, 1, { cardName: 'Elsa', cardId: '1-1', instanceId: 'inst-a' }),
      entry('CARD_DRAWN', 2, 2, { cardName: 'Elsa', cardId: '1-1', instanceId: 'inst-b' }),
      entry('CARD_DRAWN', 2, 3, { cardName: 'Mickey', cardId: '2-1', instanceId: 'inst-c' }),
    ]
    const result = parseGamelog('x', logs, { yourPlayerNum: 1 })
    // Opponent is player 2
    const opp = result.inferredOppDecklist
    const elsa = opp.find(c => c.cardId === '1-1')
    const mickey = opp.find(c => c.cardId === '2-1')
    expect(elsa?.count).toBe(2)
    expect(mickey?.count).toBe(1)
  })
})

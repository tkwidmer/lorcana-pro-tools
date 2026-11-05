import { describe, it, expect } from 'vitest'
import { parseColors, parseGamelog } from '../parseGamelog'
import realGame from '../../../fixtures/gamelogs/019e5363-fdf8-7089-9e2e-87aa4b543bd1.json'

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

  it('marks disconnected when PLAYER_DISCONNECTED fires', () => {
    const logs = [
      entry('PLAYER_DISCONNECTED', 1, 2, { closeCode: 1006, cleanClose: false }),
      entry('GAME_END', null, 2, { winner: 2, victoryReason: 'timeout' }),
    ]
    const result = parseGamelog('x', logs, {})
    expect(result.disconnected).toBe(true)
    expect(result.victoryReason).toBe('timeout')
  })

  it('leaves disconnected false when no PLAYER_DISCONNECTED event occurs', () => {
    const logs = [entry('GAME_END', null, 5, { winner: 1, victoryReason: 'timeout' })]
    const result = parseGamelog('x', logs, {})
    expect(result.disconnected).toBe(false)
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

  it('reads the defender from cardRefs in replay-file logs, which omit targetCardName', () => {
    const logs = [{
      ...entry('CARD_ATTACK', 2, 3, { cardName: 'Higgins - Undercover Officer', attackerBanished: false, defenderBanished: false }),
      cardRefs: [{ id: '10-5', name: 'Higgins - Undercover Officer' }, { id: '12-47', name: "Will o' the Wisp - Forest Spirit" }],
    }]
    expect(parseGamelog('x', logs, {}).challenges[0].defenderName).toBe("Will o' the Wisp - Forest Spirit")
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

describe('parseGamelog - plays', () => {
  it('lists each CARD_PLAYED in event order with its round and player', () => {
    const logs = [
      entry('TURN_START', 1, 1),
      entry('CARD_PLAYED', 1, 1, { cardName: 'Elsa', cardId: '1-1' }),
      entry('CARD_INKED', 1, 1, { cardName: 'Mickey', cardId: '1-2' }),
      entry('TURN_START', 2, 2),
      entry('CARD_PLAYED', 2, 2, { cardName: 'Hades', cardId: '2-1' }),
      entry('TURN_START', 1, 2),
      entry('CARD_PLAYED', 1, 2, { cardName: 'Mickey', cardId: '1-2' }),
    ]
    expect(parseGamelog('x', logs, {}).plays).toEqual([
      { turn: 1, player: 1, cardName: 'Elsa', cardId: '1-1' },
      { turn: 2, player: 2, cardName: 'Hades', cardId: '2-1' },
      { turn: 2, player: 1, cardName: 'Mickey', cardId: '1-2' },
    ])
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

  it('counts opening-hand copies on top of drawn copies', () => {
    const logs = [
      entry('INITIAL_HAND', 2, 0, { initialHandCards: [{ id: '1-1', name: 'Elsa' }, { id: '2-1', name: 'Mickey' }] }),
      entry('MULLIGAN', 2, 0, { mulliganedCards: [{ id: '2-1', name: 'Mickey' }], drawnCards: [{ id: '1-1', name: 'Elsa' }] }),
      entry('CARD_DRAWN', 2, 1, { cardName: 'Elsa', cardId: '1-1', instanceId: 'inst-a' }),
    ]
    const opp = parseGamelog('x', logs, { yourPlayerNum: 1 }).inferredOppDecklist
    expect(opp).toEqual([{ cardId: '1-1', count: 3 }, { cardId: '2-1', count: 1 }])
  })

  // duels.ink serves each player a perspective-filtered log: entries visible only to the
  // opponent (their CARD_DRAWN, INITIAL_HAND, MULLIGAN...) arrive with empty data.
  it('infers from revealed cards when the opponent draws are blanked', () => {
    const filtered = realGame.map(e => (e.visibility === 2 ? { ...e, data: {} } : e))
    expect(filtered.some(e => e.player === 2 && e.type === 'CARD_DRAWN' && e.data.cardId)).toBe(false)

    const inferred = parseGamelog('x', filtered, { yourPlayerNum: 1 }).inferredOppDecklist
    const full = Object.fromEntries(parseGamelog('x', realGame, { yourPlayerNum: 1 }).inferredOppDecklist.map(c => [c.cardId, c.count]))
    const byId = Object.fromEntries(inferred.map(c => [c.cardId, c.count]))

    expect(Object.keys(byId).sort()).toEqual(Object.keys(full).sort())
    for (const [id, n] of Object.entries(byId)) expect(n).toBeLessThanOrEqual(full[id])
    // Pawpsicle: 5 plays (Tamatoa recurs it) but no instanceId on any of them → 1, not 5.
    expect(byId['2-169']).toBe(1)
    // Monstro: two distinct instanceIds attack → 2 copies.
    expect(byId['8-64']).toBe(2)
  })
})

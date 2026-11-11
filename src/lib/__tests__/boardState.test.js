import { describe, it, expect } from 'vitest'
import { boardRows, cardRules, createBoard, legalOptions } from '../boardState'

const ev = (type, player, data = {}) => ({ type, player, data })
const char = (strength, willpower, extra = {}) => ({ type: 'Character', cost: 2, strength, willpower, lore: 1, ...extra })
const cards = {
  A: char(2, 3),
  B: char(1, 2),
  R: char(3, 3, { keywordAbilities: ['Rush'] }),
  E: char(1, 1, { keywordAbilities: ['Evasive'] }),
  G: char(1, 4, { keywordAbilities: ['Bodyguard'] }),
  L: char(2, 2, { fullText: 'I WON\'T LET YOU DOWN This character can challenge\nready characters.' }),
  K: char(4, 2, { fullText: 'NEW INCENTIVE When you play this character, chosen character can challenge ready characters this turn.' }),
  P: char(0, 3, { fullText: 'GOOD DOG ⟳ — You pay 1 ⬡ less for the next character you play this turn.' }),
  S: char(3, 4, { keywordAbilities: ['Shift'] }),
}
const play = (p, cardId, extra = {}) => ev('CARD_PLAYED', p, { cardId, cardCost: 2, ...extra })
const quest = (p, cardId) => ev('CARD_QUEST', p, { cardId, loreGained: 1 })
const attack = (p, cardId, targetCardId) => ev('CARD_ATTACK', p, { cardId, targetCardId })
const turn = (p, ...events) => [ev('TURN_START', p), ...events, ev('TURN_END', p)]

function run(events) {
  const B = createBoard(cards)
  const checks = events.map((e) => B.step(e)).filter(Boolean)
  return { B, checks }
}

describe('cardRules', () => {
  it('reads rule text across fullText line breaks', () => {
    expect(cardRules(cards.L).challengesReady).toBe(true)
    expect(cardRules({ type: 'Character', fullText: 'Challenger +2 (While challenging...)\nResist +1' })).toMatchObject({ challenger: 2, resist: 1 })
  })
})

describe('createBoard', () => {
  it('agrees with a quest by a ready character and rejects one by a character played this turn', () => {
    const { checks } = run([...turn(1, play(1, 'A')), ...turn(2), ...turn(1, play(1, 'B'), quest(1, 'A'), quest(1, 'B'))])
    expect(checks.map((c) => c.reason)).toEqual([null, 'drying'])
  })

  it('lets a Rush character challenge the turn it is played', () => {
    const { checks } = run([...turn(1, play(1, 'A')), ...turn(2, play(2, 'B')), ...turn(1, quest(1, 'A')), ...turn(2, play(2, 'R'), attack(2, 'R', 'A'))])
    expect(checks.at(-1)).toMatchObject({ reason: null, targetReason: null })
  })

  it('rejects a challenge into a ready character, unless an unnamed exert effect explains it', () => {
    const setup = [...turn(1, play(1, 'A')), ...turn(2, play(2, 'B'))]
    expect(run([...setup, ...turn(1, attack(1, 'A', 'B'))]).checks.at(-1).targetReason).toBe('not exerted')
    const exert = ev('ABILITY_TRIGGERED', 1, { effectDescriptionKeys: [{ key: 'exertsCharacter' }] })
    expect(run([...setup, ...turn(1, exert, attack(1, 'A', 'B'))]).checks.at(-1)).toMatchObject({ targetReason: null, inferred: true })
  })

  it('accepts a ready target for a character that can challenge ready characters, printed or granted', () => {
    const printed = run([...turn(1, play(1, 'L')), ...turn(2, play(2, 'B')), ...turn(1, attack(1, 'L', 'B'))])
    expect(printed.checks.at(-1)).toMatchObject({ targetReason: null, inferred: false })
    const grant = ev('ABILITY_TRIGGERED', 1, { effectDescriptionKeys: [{ key: 'x', params: { effectType: 'can_challenge_ready' } }] })
    const granted = run([...turn(1, play(1, 'A')), ...turn(2, play(2, 'B')), ...turn(1, play(1, 'K'), grant, attack(1, 'A', 'B'))])
    expect(granted.checks.at(-1)).toMatchObject({ targetReason: null, inferred: false })
  })

  it('exerts a character that uses a ⟳ ability', () => {
    const { checks } = run([...turn(1, play(1, 'P')), ...turn(2), ...turn(1, ev('ABILITY_ACTIVATED', 1, { cardId: 'P', abilityName: 'GOOD DOG' }), quest(1, 'P'))])
    expect(checks.at(-1).reason).toBe('exerted')
  })

  it('undoes the last action', () => {
    const { checks } = run([...turn(1, play(1, 'A')), ...turn(2), ...turn(1, quest(1, 'A'), ev('FREE_UNDO', 1), quest(1, 'A'))])
    expect(checks.map((c) => c.reason)).toEqual([null, null])
  })

  it('moves a shifted character\'s state onto the shift and removes banished characters', () => {
    const { B } = run([
      ...turn(1, play(1, 'A')), ...turn(2),
      ...turn(1, quest(1, 'A'), play(1, 'S', { usedShift: true, shiftTargetCardId: 'A' })),
      ...turn(2, play(2, 'B')), ev('CARD_DESTROYED', 2, { cardId: 'B', fromZone: 'field' }),
    ])
    expect(B.state.board[1]).toMatchObject([{ cardId: 'S', exerted: true, dry: false }])
    expect(B.state.board[2]).toEqual([])
  })

  it('tracks damage from challenges', () => {
    const { B } = run([
      ...turn(1, play(1, 'A')), ...turn(2, play(2, 'B')), ...turn(1, quest(1, 'A')),
      ev('TURN_START', 2), attack(2, 'B', 'A'), ev('CARD_ATTACK', 2, { cardId: 'B', targetCardId: 'A', attackerBaseStrength: 1, attackerTotalDamage: 2, defenderTotalDamage: 1 }),
    ])
    expect(B.state.board[1][0].damage).toBe(1)
    expect(B.state.board[2][0].damage).toBe(2)
  })
})

describe('legalOptions', () => {
  const optionsAfter = (events, p) => {
    const { B } = run(events)
    return legalOptions(B, p).map((o) => [o.kind, o.attacker?.cardId ?? null, o.target?.cardId ?? null])
  }

  it('offers quest and challenges of exerted targets for each ready character, then ending the turn', () => {
    expect(optionsAfter([...turn(1, play(1, 'A')), ...turn(2, play(2, 'B')), ...turn(1), ev('TURN_START', 2), quest(2, 'B'), ev('TURN_END', 2), ev('TURN_START', 1)], 1))
      .toEqual([['quest', 'A', null], ['challenge', 'A', 'B'], ['end', null, null]])
  })

  it('keeps Evasive targets for Evasive attackers and forces an exerted Bodyguard first', () => {
    const board = [...turn(1, play(1, 'A'), play(1, 'E')), ...turn(2, play(2, 'E'), play(2, 'G')), ...turn(1), ev('TURN_START', 2), quest(2, 'E'), quest(2, 'G'), ev('TURN_END', 2), ev('TURN_START', 1)]
    expect(optionsAfter(board, 1).filter((o) => o[0] === 'challenge')).toEqual([['challenge', 'A', 'G'], ['challenge', 'E', 'G']])
  })
})

describe('boardRows', () => {
  it('labels the chosen option with its combat outcome and writes rows only for trusted turns', () => {
    const log = [...turn(1, play(1, 'A')), ...turn(2, play(2, 'B')), ...turn(1), ...turn(2, quest(2, 'B')), ...turn(1, attack(1, 'A', 'B'))]
    const { rows, checks } = boardRows(log, cards)
    const chosen = rows.filter((r) => r.chosen === 1).map((r) => [r.player, r.option, r.a_card_id, r.t_card_id, r.kills, r.survives])
    expect(chosen).toContainEqual([1, 'challenge', 'A', 'B', 1, 1])
    expect(checks).toMatchObject({ target: 1, targetBad: 0, inLegalSet: 1, legalChecked: 1 })

    const untrusted = boardRows([...turn(1, play(1, 'A')), ...turn(2, play(2, 'B')), ...turn(1, attack(1, 'A', 'B'))], cards)
    expect(untrusted.rows.filter((r) => r.my_turn === 2 && r.player === 1)).toEqual([])
    expect(untrusted.checks.targetBad).toBe(1)
  })
})

import { describe, it, expect } from 'vitest'
import { replayLogsToGamelog } from '../replayLogs'
import { parseGamelog } from '../parseGamelog'

const pain = { id: '13-48', name: 'Pain - Running with Scissors' }
const higgins = { id: '10-5', name: 'Higgins - Undercover Officer' }
const wisp = { id: '12-47', name: "Will o' the Wisp - Forest Spirit" }
const ev = (type, player, data, cardRefs, extra = {}) => ({ type, player, turnNumber: 3, data, cardRefs, ...extra })

describe('replayLogsToGamelog', () => {
  it('credits an ability lore grant to its source card, which parseGamelog reads from data', () => {
    const logs = [ev('ABILITY_TRIGGERED', 2, {
      abilityName: 'MULTIPURPOSE TOOL',
      effectDescriptionKeys: [{ key: 'gainsLore', params: { amount: 2, previous: 18, total: 20 } }],
    }, [pain])]
    const game = parseGamelog('x', replayLogsToGamelog(logs), {})
    expect(game.p2.cards[pain.name].loreGained).toBe(2)
    expect(game.p2FinalLore).toBe(20)
  })

  it('names the challenge defender from the second card ref and its strength from the damage it dealt back', () => {
    const logs = [ev('CARD_ATTACK', 2, { cardName: higgins.name, attackerBanished: false, defenderBanished: false, rawDamageToAttacker: 0 }, [higgins, wisp])]
    const [challenge] = parseGamelog('x', replayLogsToGamelog(logs), {}).challenges
    expect(challenge.defenderName).toBe(wisp.name)
    expect(challenge.defenderStrength).toBe(0)
  })

  it('splits mulligan refs at mulliganCount into sent and drawn cards', () => {
    const [m] = replayLogsToGamelog([ev('MULLIGAN', 2, { mulliganCount: 1 }, [higgins, wisp, pain])])
    expect(m.data.mulliganedCards).toEqual([higgins])
    expect(m.data.drawnCards).toEqual([wisp, pain])
  })

  it('moves a top-level instanceId into data and leaves fields the replay already has', () => {
    const [a] = replayLogsToGamelog([ev('ABILITY_TRIGGERED', 1, { abilitySourceCardName: 'Kept', abilitySourceCardId: '1-1' }, [pain], { instanceId: 'i1' })])
    expect(a.data).toMatchObject({ abilitySourceCardName: 'Kept', instanceId: 'i1' })
  })
})

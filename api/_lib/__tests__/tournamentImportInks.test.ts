import { describe, it, expect } from 'vitest'
import { playerInksFromMatches } from '../tournamentImport'

const rel = (id: number, value: string | null) => ({
  player: { id },
  user_event_status: { deck_descriptor_label: value == null ? null : { parts: [{ value }] } },
})

describe('playerInksFromMatches', () => {
  it('reads each player\'s sorted pair and skips players without a valid one', () => {
    const map = playerInksFromMatches([
      { player_match_relationships: [rel(1, 'steel,emerald'), rel(2, null)] },
      { player_match_relationships: [rel(3, 'amber,ink'), rel(1, 'emerald,steel')] },
    ])
    expect(map.get('1')).toEqual(['emerald', 'steel'])
    expect(map.has('2')).toBe(false)
    expect(map.has('3')).toBe(false)
  })
})

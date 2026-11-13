import { describe, it, expect } from 'vitest'
import { filterLiveCandidates, templateLabel } from '../tournamentDiscovery'

const now = new Date('2026-11-06T12:00:00Z')
const e = (id: number, display_status: string, start: string | null, store = 'Fanfinity') =>
  ({ id, name: `E${id}`, label: 'DLC', display_status, start_datetime: start, starting_player_count: 100, store: { id: 1, name: store } }) as any

describe('filterLiveCandidates', () => {
  it('keeps in-progress events and upcoming ones within the window, in that order', () => {
    const out = filterLiveCandidates(
      [
        e(3, 'upcoming', '2026-11-15T10:00:00Z'),
        e(1, 'inProgress', '2026-11-06T09:00:00Z'),
        e(2, 'upcoming', '2026-11-08T10:00:00Z'),
      ],
      now
    )
    expect(out.map((x) => x.id)).toEqual([1, 2, 3])
  })
  it('drops complete, far-future, past-but-still-upcoming, undated and fake-store events', () => {
    const out = filterLiveCandidates(
      [
        e(1, 'complete', '2026-11-01T10:00:00Z'),
        e(2, 'upcoming', '2026-12-25T10:00:00Z'),
        e(3, 'upcoming', '2026-10-01T10:00:00Z'),
        e(4, 'upcoming', null),
        e(5, 'inProgress', '2026-11-06T09:00:00Z', 'Ravensburger HQ'),
      ],
      now
    )
    expect(out).toEqual([])
  })
})

describe('templateLabel', () => {
  it('labels a qualifier tagged with the Championship template as a CCQ', () => {
    expect(templateLabel('Championship', 'DLC London: Challenge Championship Qualifier')).toBe('CCQ')
    expect(templateLabel('Championship', 'European Championship')).toBe('Championship')
    expect(templateLabel('Championship', 'Disney Lorcana Challenge North American Championship')).toBe('Championship')
    expect(templateLabel('DLC', 'DLC London: Challenge Championship Qualifier')).toBe('DLC')
  })
})

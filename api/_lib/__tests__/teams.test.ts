import { describe, it, expect } from 'vitest'
import {
  isMemberOn,
  groupTeamEvents,
  lastEventOf,
  canEditTeam,
  adminOnlyFieldsSent,
  isValidLogoUrl,
  isValidSlug,
} from '../teams'

const open = { joined_on: '2025-01-10', left_on: null }
const closed = { joined_on: '2025-01-10', left_on: '2026-10-30' }

describe('isMemberOn', () => {
  it('counts the join day, the leave day, and anything between', () => {
    expect(isMemberOn(open, '2025-01-10')).toBe(true)
    expect(isMemberOn(closed, '2026-10-30')).toBe(true)
    expect(isMemberOn(closed, '2026-01-01')).toBe(true)
  })
  it('an unknown start counts from the beginning of the archive, until any leaving date', () => {
    expect(isMemberOn({ joined_on: null, left_on: null }, '2025-07-19')).toBe(true)
    expect(isMemberOn({ joined_on: null, left_on: '2026-01-01' }, '2025-12-31')).toBe(true)
    expect(isMemberOn({ joined_on: null, left_on: '2026-01-01' }, '2026-01-02')).toBe(false)
  })
  it('excludes before joining and after leaving, and an event with no date', () => {
    expect(isMemberOn(open, '2025-01-09')).toBe(false)
    expect(isMemberOn(closed, '2026-10-31')).toBe(false)
    expect(isMemberOn(open, null)).toBe(false)
  })
})

const ev = (id: string, date: string | null) => ({
  id: `db-${id}`,
  rph_event_id: id,
  event_name: `Event ${id}`,
  event_date: date,
  store_name: 'S',
  starting_player_count: 100,
  top_cut_size: 8,
  event_tier: 'challenge',
  event_url: null,
})
const row = (pid: string, e: ReturnType<typeof ev>, rank: number | null) => ({
  rph_player_id: pid,
  player_name: `P${pid}`,
  rank,
  record: '5-2-0',
  made_top_cut: rank != null && rank <= 8,
  made_day_two: false,
  inks: null,
  event: e,
})
const members = [
  { id: 'm1', team_id: 't', rph_player_id: '1', player_name: 'P1', joined_on: '2025-01-01', left_on: null },
  { id: 'm2', team_id: 't', rph_player_id: '2', player_name: 'P2', joined_on: '2025-01-01', left_on: '2026-06-30' },
]

describe('groupTeamEvents', () => {
  it('groups by event newest first, drops a former member after leaving, keeps them before', () => {
    const early = ev('100', '2026-03-01')
    const late = ev('200', '2026-09-01')
    const events = groupTeamEvents(members, [row('2', late, 3), row('1', late, 40), row('2', early, 12), row('1', early, null)])
    expect(events.map((e) => e.eventId)).toEqual(['200', '100'])
    expect(events[0].results.map((r) => r.playerId)).toEqual(['1']) // P2 had left
    expect(events[1].results.map((r) => r.playerId)).toEqual(['2', '1']) // by rank, null last
    expect(events[1].results[0].former).toBe(true)
    expect(events[0].results[0].former).toBe(false)
  })
  it('ignores rows whose event has no date', () => {
    expect(groupTeamEvents(members, [row('1', ev('1', null), 1)])).toEqual([])
  })
  it('orders same-day events by the larger event id first', () => {
    const events = groupTeamEvents(members, [row('1', ev('5', '2026-09-01'), 1), row('1', ev('50', '2026-09-01'), 1)])
    expect(events.map((e) => e.eventId)).toEqual(['50', '5'])
  })
})

describe('lastEventOf', () => {
  it('returns the newest event with its best rank, null when none', () => {
    const events = groupTeamEvents(members, [row('1', ev('9', '2026-09-01'), 40), row('2', ev('9', '2026-09-01'), 3)])
    expect(lastEventOf(events)).toEqual({ eventId: '9', eventName: 'Event 9', eventDate: '2026-09-01', bestRank: 40 })
    expect(lastEventOf([])).toBeNull()
  })
  it('has a null best rank when no result carries a rank', () => {
    expect(lastEventOf(groupTeamEvents(members, [row('1', ev('9', '2026-09-01'), null)]))?.bestRank).toBeNull()
  })
})

describe('canEditTeam', () => {
  const live = { manager_user_id: 'mgr', disbanded_on: null }
  const dead = { manager_user_id: 'mgr', disbanded_on: '2026-08-14' }
  it('admins and the manager may write a live team; others may not', () => {
    expect(canEditTeam({ id: 'x', isAdmin: true }, live, 'write')).toBe('ok')
    expect(canEditTeam({ id: 'mgr', isAdmin: false }, live, 'write')).toBe('ok')
    expect(canEditTeam({ id: 'other', isAdmin: false }, live, 'write')).toBe('forbidden')
    expect(canEditTeam({ id: 'other', isAdmin: false }, { ...live, manager_user_id: null }, 'write')).toBe('forbidden')
  })
  it('a disbanded team refuses writes from everyone, and only an admin may reinstate', () => {
    expect(canEditTeam({ id: 'mgr', isAdmin: false }, dead, 'write')).toBe('disbanded')
    expect(canEditTeam({ id: 'x', isAdmin: true }, dead, 'write')).toBe('disbanded')
    expect(canEditTeam({ id: 'x', isAdmin: true }, dead, 'reinstate')).toBe('ok')
    expect(canEditTeam({ id: 'mgr', isAdmin: false }, dead, 'reinstate')).toBe('forbidden')
  })
})

describe('field guards', () => {
  it('flags admin-only fields when present', () => {
    expect(adminOnlyFieldsSent({ name: 'x' })).toBe(false)
    expect(adminOnlyFieldsSent({ slug: 'x' })).toBe(true)
    expect(adminOnlyFieldsSent({ managerUserId: null })).toBe(true)
  })
  it('accepts only logos under the stream-logos public path', () => {
    const base = 'https://abc.supabase.co'
    expect(isValidLogoUrl(`${base}/storage/v1/object/public/stream-logos/u/1.png`, base)).toBe(true)
    expect(isValidLogoUrl('https://evil.example/x.png', base)).toBe(false)
    expect(isValidLogoUrl(`${base}/storage/v1/object/public/other/1.png`, base)).toBe(false)
    expect(isValidLogoUrl(42, base)).toBe(false)
  })
  it('validates slugs', () => {
    expect(isValidSlug('inkborn-forge')).toBe(true)
    expect(isValidSlug('a')).toBe(false)
    expect(isValidSlug('Bad Slug')).toBe(false)
    expect(isValidSlug('-x')).toBe(false)
    expect(isValidSlug('x'.repeat(49))).toBe(false)
  })
})

describe('isValidLogoUrl hardening', () => {
  const base = 'https://abc.supabase.co'
  it('rejects a path that escapes the bucket through dot segments', () => {
    expect(isValidLogoUrl(`${base}/storage/v1/object/public/stream-logos/../other/x.png`, base)).toBe(false)
  })
  it('accepts a real upload URL when the configured base has a trailing slash', () => {
    expect(isValidLogoUrl(`${base}/storage/v1/object/public/stream-logos/u/1.png`, `${base}/`)).toBe(true)
  })
  it('rejects a different origin with the same path', () => {
    expect(isValidLogoUrl('https://evil.example/storage/v1/object/public/stream-logos/u/1.png', base)).toBe(false)
  })
})

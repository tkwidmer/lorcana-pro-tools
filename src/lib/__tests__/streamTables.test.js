import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn(() => Promise.resolve({ error: null }))
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...args) => rpc(...args) }, getCurrentUser: vi.fn() }))

const { failureTracker } = await import('../streamTables')

describe('failureTracker', () => {
  beforeEach(() => { rpc.mockClear(); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

  it('logs the first failure of a run and the recovery, never the repeats', () => {
    vi.useFakeTimers()
    const t = failureTracker('table-1', 'panel', 'rph_poll')
    t.ok()
    t.fail(new Error('HTTP 502'))
    t.fail(new Error('HTTP 502'))
    vi.advanceTimersByTime(45_000)
    t.ok()
    t.ok()
    vi.useRealTimers()
    expect(rpc.mock.calls.map(([, a]) => [a.p_kind, a.p_detail])).toEqual([
      ['rph_poll_failed', 'HTTP 502'],
      ['rph_poll_recovered', 'after 45s'],
    ])
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_table_id: 'table-1', p_surface: 'panel' })
  })
})

import { describe, it, expect } from 'vitest'
import handler from '../../tournament-history'

// Request-level checks on api/tournament-history.ts that need no Supabase:
// dispatch and the validation that runs before any session lookup.

function call(method: string, query: Record<string, string>, body?: unknown) {
  const out: { status?: number; json?: any; headers: Record<string, string> } = { headers: {} }
  const res: any = {
    status(code: number) { out.status = code; return res },
    json(payload: any) { out.json = payload; return res },
    setHeader(k: string, v: string) { out.headers[k] = v },
  }
  const req: any = { method, query, body, headers: {} }
  return handler(req, res).then(() => out)
}

describe('tournament-history dispatch', () => {
  it('answers prototype-key endpoints like any unknown POST instead of calling inherited functions', async () => {
    for (const endpoint of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      const out = await call('POST', { endpoint })
      expect(out.status, endpoint).toBe(405) // the unknown-endpoint-on-POST answer; before the guard this hung
    }
  })
})

describe('team-member-save validation', () => {
  const base = { teamId: '11111111-1111-4111-8111-111111111111', playerId: '123', playerName: 'P' }
  it('refuses dates in the future before looking at the session', async () => {
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    const joined = await call('POST', { endpoint: 'team-member-save' }, { ...base, joinedOn: future, leftOn: null })
    expect(joined.status).toBe(400)
    const left = await call('POST', { endpoint: 'team-member-save' }, { ...base, joinedOn: '2025-01-01', leftOn: future })
    expect(left.status).toBe(400)
  })
  it('still asks for a session once the dates are sane', async () => {
    const out = await call('POST', { endpoint: 'team-member-save' }, { ...base, joinedOn: '2025-01-01', leftOn: null })
    expect(out.status).toBe(401)
  })
})

import { VercelRequest, VercelResponse } from '@vercel/node'

const RAVEN_BASE = 'https://api.ravensburgerplay.com/api/v2'
// Match results are not exposed on RAVEN_BASE without an authenticated session
// (401 "Authentication credentials were not provided"). The public tournament
// results page instead reads match data through this Cloudflare-fronted proxy.
const HYDRA_BASE = 'https://api.cloudflare.ravensburgerplay.com/hydraproxy/api/v2'

function str(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

// Tournament/round IDs are short alphanumeric tokens (numeric or UUID-style).
// Reject anything else so they can't traverse paths or inject into the upstream
// query string.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

// The events list endpoint takes the store's internal numeric id (distinct
// from the game-stores UUID used for the `store` type above).
const NUMERIC_ID_RE = /^[0-9]{1,10}$/

function clampInt(v: string | undefined, def: number, max: number): number {
  const n = parseInt(v ?? '', 10)
  if (!Number.isFinite(n) || n < 1) return def
  return Math.min(n, max)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const type = str(req.query.type)
  const eventId = str(req.query.eventId)
  const roundId = str(req.query.roundId)
  const storeId = str(req.query.storeId)
  const storeNumericId = str(req.query.storeNumericId)
  const page = clampInt(str(req.query.page), 1, 10000)
  const pageSize = clampInt(str(req.query.pageSize), 10, 200)

  let url: string

  switch (type) {
    case 'event':
      if (!eventId) return res.status(400).json({ error: 'Missing eventId' })
      if (!ID_RE.test(eventId)) return res.status(400).json({ error: 'Invalid eventId' })
      url = `${RAVEN_BASE}/events/${encodeURIComponent(eventId)}`
      break
    case 'registrations':
      if (!eventId) return res.status(400).json({ error: 'Missing eventId' })
      if (!ID_RE.test(eventId)) return res.status(400).json({ error: 'Invalid eventId' })
      url = `${RAVEN_BASE}/events/${encodeURIComponent(eventId)}/registrations/?page=${page}&page_size=${pageSize}`
      break
    case 'standings':
      if (!roundId) return res.status(400).json({ error: 'Missing roundId' })
      if (!ID_RE.test(roundId)) return res.status(400).json({ error: 'Invalid roundId' })
      url = `${RAVEN_BASE}/tournament-rounds/${encodeURIComponent(roundId)}/standings/paginated/?page=${page}&page_size=${pageSize}`
      break
    case 'matches':
      if (!roundId) return res.status(400).json({ error: 'Missing roundId' })
      if (!ID_RE.test(roundId)) return res.status(400).json({ error: 'Invalid roundId' })
      url = `${HYDRA_BASE}/tournament-rounds/${encodeURIComponent(roundId)}/matches/paginated/?page=${page}&page_size=${pageSize}&avoid_cache=false`
      break
    case 'store':
      if (!storeId) return res.status(400).json({ error: 'Missing storeId' })
      if (!ID_RE.test(storeId)) return res.status(400).json({ error: 'Invalid storeId' })
      url = `${HYDRA_BASE}/game-stores/${encodeURIComponent(storeId)}/`
      break
    case 'storeEvents':
      if (!storeNumericId) return res.status(400).json({ error: 'Missing storeNumericId' })
      if (!NUMERIC_ID_RE.test(storeNumericId)) return res.status(400).json({ error: 'Invalid storeNumericId' })
      url = `${RAVEN_BASE}/events/?store=${encodeURIComponent(storeNumericId)}&game_slug=disney-lorcana&page=${page}&page_size=${pageSize}`
      break
    default:
      return res.status(400).json({ error: 'Missing or invalid type param' })
  }

  try {
    const response = await fetch(url)
    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()

    if (!response.ok) {
      if (response.status === 404 && type === 'matches') {
        return res.status(200).json({ matches: [], results: [], next_page_number: null })
      }
      return res.status(response.status).json({ error: 'Tournament API error', status: response.status })
    }

    if (!body || body.trim().length === 0) {
      return res.status(502).json({ error: 'Empty response from tournament API' })
    }

    if (!contentType.includes('application/json')) {
      return res.status(502).json({ error: 'Non-JSON response from tournament API' })
    }

    try { JSON.parse(body) } catch {
      return res.status(502).json({ error: 'Invalid JSON from tournament API' })
    }

    res.status(200)
      .setHeader('Content-Type', contentType)
      .setHeader('Cache-Control', 'max-age=30, s-maxage=30')
      .send(body)
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach tournament API', detail: String(e) })
  }
}

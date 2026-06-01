import { VercelRequest, VercelResponse } from '@vercel/node'

const RAVEN_BASE = 'https://api.ravensburgerplay.com/api/v2'

function str(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const type = str(req.query.type)
  const eventId = str(req.query.eventId)
  const roundId = str(req.query.roundId)
  const page = str(req.query.page) ?? '1'
  const pageSize = str(req.query.pageSize) ?? '10'

  let url: string

  switch (type) {
    case 'event':
      if (!eventId) return res.status(400).json({ error: 'Missing eventId' })
      url = `${RAVEN_BASE}/events/${eventId}`
      break
    case 'registrations':
      if (!eventId) return res.status(400).json({ error: 'Missing eventId' })
      url = `${RAVEN_BASE}/events/${eventId}/registrations/?page=${page}&page_size=${pageSize}`
      break
    case 'standings':
      if (!roundId) return res.status(400).json({ error: 'Missing roundId' })
      url = `${RAVEN_BASE}/tournament-rounds/${roundId}/standings/paginated/?page=${page}&page_size=${pageSize}`
      break
    case 'matches':
      if (!roundId) return res.status(400).json({ error: 'Missing roundId' })
      url = `${RAVEN_BASE}/tournament-rounds/${roundId}/matches/`
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

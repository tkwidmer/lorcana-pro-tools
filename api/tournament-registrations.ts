import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { eventId, page = '1', pageSize = '10' } = req.query

  if (!eventId) {
    return res.status(400).json({ error: 'Missing eventId' })
  }

  const pageNum = typeof page === 'string' ? page : page[0]
  const size = typeof pageSize === 'string' ? pageSize : pageSize[0]

  const url = `https://api.ravensburgerplay.com/api/v2/events/${eventId}/registrations/?page=${pageNum}&page_size=${size}`

  try {
    const response = await fetch(url)
    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Event not found',
        status: response.status,
      })
    }

    if (!body || body.trim().length === 0) {
      return res.status(502).json({
        error: 'Invalid response from tournament API',
        detail: 'Empty response body',
      })
    }

    if (!contentType.includes('application/json')) {
      return res.status(502).json({
        error: 'Invalid response from tournament API',
        detail: 'Expected JSON response',
      })
    }

    try {
      JSON.parse(body)
    } catch {
      return res.status(502).json({
        error: 'Invalid JSON response from tournament API',
      })
    }

    res.status(response.status)
      .setHeader('Content-Type', contentType)
      .setHeader('Cache-Control', 'max-age=30, s-maxage=30')
      .send(body)
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach tournament API', detail: String(e) })
  }
}

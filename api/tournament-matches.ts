import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { eventId, roundId, page = '1', pageSize = '50' } = req.query

  if (!eventId || !roundId) {
    return res.status(400).json({ error: 'Missing eventId or roundId' })
  }

  const id = Array.isArray(eventId) ? eventId[0] : eventId
  const rid = Array.isArray(roundId) ? roundId[0] : roundId
  const pageNum = Array.isArray(page) ? page[0] : page
  const size = Array.isArray(pageSize) ? pageSize[0] : pageSize

  void id // eventId kept for future use / logging
  const url = `https://api.ravensburgerplay.com/api/v2/tournament-rounds/${rid}/matches/?page=${pageNum}&page_size=${size}`

  try {
    const response = await fetch(url)
    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()

    if (!response.ok) {
      // Completed tournaments return 404 for the matches endpoint — treat as empty
      if (response.status === 404) {
        return res.status(200).json({ matches: [], results: [], next_page_number: null })
      }
      return res.status(response.status).json({
        error: 'Tournament API error',
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
      return res.status(502).json({ error: 'Invalid JSON response from tournament API' })
    }

    res.status(response.status)
      .setHeader('Content-Type', contentType)
      .setHeader('Cache-Control', 'max-age=30, s-maxage=30')
      .send(body)
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach tournament API', detail: String(e) })
  }
}

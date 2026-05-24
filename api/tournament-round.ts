import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { eventId } = req.query

  if (!eventId) {
    return res.status(400).json({ error: 'Missing eventId' })
  }

  try {
    // Fetch tournament details from Ravensburger API
    const url = `https://api.cloudflare.ravensburgerplay.com/hydraproxy/api/v2/tournaments/${eventId}`
    const response = await fetch(url)
    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Tournament not found',
        status: response.status,
      })
    }

    if (!body || body.trim().length === 0) {
      return res.status(502).json({
        error: 'Invalid response from tournament API',
      })
    }

    if (!contentType.includes('application/json')) {
      return res.status(502).json({
        error: 'Invalid response from tournament API',
      })
    }

    let data
    try {
      data = JSON.parse(body)
    } catch {
      return res.status(502).json({
        error: 'Invalid JSON response from tournament API',
      })
    }

    // Find the current/latest round
    const rounds = data.rounds || data.tournament_rounds || []
    const currentRound = rounds.find((r: any) => r.is_current) || rounds[rounds.length - 1]

    if (!currentRound) {
      return res.status(404).json({
        error: 'No rounds found for this tournament',
      })
    }

    res.status(200)
      .setHeader('Content-Type', 'application/json')
      .setHeader('Cache-Control', 'max-age=60, s-maxage=60')
      .json({
        roundId: currentRound.id,
        roundNumber: currentRound.round_number || currentRound.number,
        tournamentId: eventId,
      })
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach tournament API', detail: String(e) })
  }
}

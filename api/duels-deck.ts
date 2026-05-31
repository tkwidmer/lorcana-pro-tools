import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' })
  }

  const { id } = req.query
  const deckId = Array.isArray(id) ? id[0] : id
  const url = deckId
    ? `https://duels.ink/api/decks/${encodeURIComponent(deckId)}`
    : 'https://duels.ink/api/decks'

  try {
    const upstreamRes = await fetch(url, {
      headers: { Authorization: auth },
    })

    const contentType = upstreamRes.headers.get('content-type') ?? ''
    const body = await upstreamRes.text()

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: 'duels.ink API error',
        status: upstreamRes.status,
        detail: body.slice(0, 200),
      })
    }

    if (!contentType.includes('application/json')) {
      return res.status(502).json({ error: 'Invalid response from duels.ink' })
    }

    try { JSON.parse(body) } catch {
      return res.status(502).json({ error: 'Invalid JSON response from duels.ink' })
    }

    res.status(200)
      .setHeader('Content-Type', contentType)
      .setHeader('Cache-Control', 'max-age=60, stale-while-revalidate=30')
      .send(body)
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach duels.ink', detail: String(e) })
  }
}

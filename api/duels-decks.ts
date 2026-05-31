import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' })
  }

  try {
    const upstreamRes = await fetch('https://duels.ink/api/decks', {
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
      .setHeader('Cache-Control', 'max-age=300, stale-while-revalidate=60')
      .send(body)
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach duels.ink', detail: String(e) })
  }
}

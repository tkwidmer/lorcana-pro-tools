import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' })
  }

  const { deckId, source } = req.query
  const id = Array.isArray(deckId) ? deckId[0] : deckId
  if (!id) {
    return res.status(400).json({ error: 'Missing deckId parameter' })
  }

  const params = new URLSearchParams({ deckId: id })
  const sourceParam = Array.isArray(source) ? source[0] : source
  if (sourceParam) params.set('source', sourceParam)

  try {
    const upstreamRes = await fetch(`https://duels.ink/api/account/personal-stats?${params}`, {
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

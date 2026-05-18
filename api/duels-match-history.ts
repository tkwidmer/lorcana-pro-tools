import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' })
  }

  // Forward all query params to duels.ink
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') params.set(key, value)
  }

  const upstream = `https://duels.ink/api/me/match-history?${params}`

  try {
    const upstreamRes = await fetch(upstream, {
      headers: { Authorization: auth },
    })

    const body = await upstreamRes.text()
    res.status(upstreamRes.status)
      .setHeader('Content-Type', upstreamRes.headers.get('content-type') ?? 'application/json')
      .send(body)
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach duels.ink', detail: String(e) })
  }
}

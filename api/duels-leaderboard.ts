import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') params.set(k, v)
    else if (Array.isArray(v)) params.set(k, v[0])
  }
  const qs = params.toString()
  const url = `https://duels.ink/api/leaderboard${qs ? `?${qs}` : ''}`

  try {
    const upstream = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    const text = await upstream.text()
    res.status(upstream.status)
      .setHeader('Cache-Control', 'public, max-age=300')
      .setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      .send(text)
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch leaderboard', detail: String(e) })
  }
}

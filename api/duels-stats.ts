import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { queue, period } = req.query

  if (!queue || typeof queue !== 'string') {
    return res.status(400).json({ error: 'Missing queue parameter' })
  }
  if (!period || typeof period !== 'string') {
    return res.status(400).json({ error: 'Missing period parameter' })
  }

  try {
    const url = `https://duels.ink/api/stats/meta?queue=${encodeURIComponent(queue)}&period=${encodeURIComponent(period)}&season=current`
    const upstreamRes = await fetch(url)

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `duels.ink returned ${upstreamRes.status}` })
    }

    const data = await upstreamRes.json()
    res.status(200).setHeader('Cache-Control', 'public, max-age=3600').json(data)
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch stats', detail: String(e) })
  }
}

import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' })
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing replay id' })
  }

  try {
    // duels.ink redirects to a signed CDN URL — follow redirects
    const upstreamRes = await fetch(`https://duels.ink/r/${id}`, {
      headers: { Authorization: auth },
      redirect: 'follow',
    })

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `duels.ink returned ${upstreamRes.status}` })
    }

    const buffer = await upstreamRes.arrayBuffer()
    res
      .status(200)
      .setHeader('Content-Type', 'application/gzip')
      .setHeader('Cache-Control', 'private, max-age=3600')
      .send(Buffer.from(buffer))
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch replay', detail: String(e) })
  }
}

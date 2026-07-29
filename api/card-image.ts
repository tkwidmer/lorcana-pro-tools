import { VercelRequest, VercelResponse } from '@vercel/node'

// The only host LorcanaJSON's card `images.*` fields ever point to — allow-listed
// so this route can't be used as an open proxy for arbitrary URLs.
const ALLOWED_HOST = 'api.lorcana.ravensburger.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url' })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid url' })
  }

  if (parsed.hostname !== ALLOWED_HOST) {
    return res.status(400).json({ error: 'Unsupported image host' })
  }

  try {
    const upstreamRes = await fetch(parsed.toString())
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `Image host returned ${upstreamRes.status}` })
    }

    const buffer = await upstreamRes.arrayBuffer()
    res
      .status(200)
      .setHeader('Content-Type', upstreamRes.headers.get('content-type') ?? 'image/jpeg')
      .setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      .send(Buffer.from(buffer))
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch card image', detail: String(e) })
  }
}

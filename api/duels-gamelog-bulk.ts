import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' })
  }

  const { ids } = req.body ?? {}
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }

  try {
    const upstreamRes = await fetch('https://duels.ink/api/me/bulk-gamelogs', {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids }),
    })

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `duels.ink returned ${upstreamRes.status}` })
    }

    const data = await upstreamRes.json()
    res.status(200).json(data)
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch gamelog manifest', detail: String(e) })
  }
}

import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { uuid } = req.query

  if (!uuid || typeof uuid !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid uuid parameter' })
  }

  // Extract just the UUID part if a full URL was passed
  const uuidMatch = uuid.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  const cleanUuid = uuidMatch ? uuidMatch[0] : uuid

  // Try multiple endpoints
  const endpoints = [
    `/api/spectate/${cleanUuid}`,
    `/api/game/${cleanUuid}`,
    `/api/games/${cleanUuid}`,
  ]

  for (const endpoint of endpoints) {
    try {
      const url = `https://duels.ink${endpoint}`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        return res.status(200).json(data)
      }
    } catch (e) {
      // Try next endpoint
      continue
    }
  }

  return res.status(404).json({ error: 'Game not found or not accessible' })
}

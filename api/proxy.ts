import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { uuid } = req.query

  if (!uuid || typeof uuid !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid uuid parameter' })
  }

  // Extract just the UUID part if a full URL was passed
  const uuidMatch = uuid.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  const cleanUuid = uuidMatch ? uuidMatch[0] : uuid

  // Forward cookies from the browser to duels.ink
  const cookies = req.headers.cookie || ''
  console.log(`[Proxy] UUID: ${cleanUuid}, Cookies present: ${!!cookies}`)

  // Try multiple endpoints
  const endpoints = [
    `/api/spectate/${cleanUuid}`,
    `/api/game/${cleanUuid}`,
    `/api/games/${cleanUuid}`,
  ]

  const attempts = []

  for (const endpoint of endpoints) {
    try {
      const url = `https://duels.ink${endpoint}`
      console.log(`[Proxy] Trying ${url}`)
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...(cookies && { 'Cookie': cookies }),
        },
      })

      console.log(`[Proxy] ${url} → ${response.status}`)
      attempts.push({ endpoint, status: response.status })

      if (response.ok) {
        const data = await response.json()
        console.log(`[Proxy] Success from ${endpoint}`)
        return res.status(200).json(data)
      }

      if (response.status === 401 || response.status === 403) {
        // Auth failed, but might work with different endpoint
        continue
      }
    } catch (e) {
      console.log(`[Proxy] Error on ${endpoint}: ${e.message}`)
      attempts.push({ endpoint, error: e.message })
      continue
    }
  }

  console.log(`[Proxy] All endpoints failed:`, attempts)
  return res.status(404).json({
    error: 'Game not found or not accessible. Make sure you\'re logged into duels.ink in this browser and the spectate link is valid.',
    debug: { attempts, hasCookies: !!cookies }
  })
}

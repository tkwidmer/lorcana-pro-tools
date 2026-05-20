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

    const contentType = upstreamRes.headers.get('content-type') ?? ''
    const body = await upstreamRes.text()

    // If upstream returned an error, return a proper error response
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: 'duels.ink API error',
        status: upstreamRes.status,
        detail: body.slice(0, 200) // Include first 200 chars of error for debugging
      })
    }

    // Validate that response is not empty
    if (!body || body.trim().length === 0) {
      return res.status(502).json({
        error: 'Invalid response from duels.ink',
        detail: 'Empty response body'
      })
    }

    // Validate that response is JSON before forwarding
    if (!contentType.includes('application/json')) {
      return res.status(502).json({
        error: 'Invalid response from duels.ink',
        detail: contentType ? 'Expected JSON response, got different content-type' : 'Expected JSON response, unknown content-type'
      })
    }

    // Try to parse as JSON to validate it's valid
    try {
      JSON.parse(body)
    } catch {
      return res.status(502).json({
        error: 'Invalid JSON response from duels.ink',
        detail: 'Response is not valid JSON'
      })
    }

    res.status(upstreamRes.status)
      .setHeader('Content-Type', contentType)
      .setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      .setHeader('Pragma', 'no-cache')
      .setHeader('Expires', '0')
      .send(body)
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach duels.ink', detail: String(e) })
  }
}

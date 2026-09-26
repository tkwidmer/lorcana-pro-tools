import { VercelRequest, VercelResponse } from '@vercel/node'

// Single consolidated proxy for all duels.ink endpoints, dispatched by `?endpoint=`.
// Folded into one function because Vercel's Hobby plan caps a deployment at 12
// serverless functions — see CLAUDE.md's API Routes table for the full endpoint list.

function requireBearer(req: VercelRequest, res: VercelResponse): string | null {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer token' })
    return null
  }
  return auth
}

function param(req: VercelRequest, name: string): string | undefined {
  const v = req.query[name]
  return Array.isArray(v) ? v[0] : v
}

async function proxyJson(res: VercelResponse, url: string, init: RequestInit, cacheControl?: string) {
  try {
    const upstreamRes = await fetch(url, init)
    const contentType = upstreamRes.headers.get('content-type') ?? ''
    const body = await upstreamRes.text()

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: 'duels.ink API error',
        status: upstreamRes.status,
        detail: body.slice(0, 200),
      })
    }
    if (!body || body.trim().length === 0) {
      return res.status(502).json({ error: 'Invalid response from duels.ink', detail: 'Empty response body' })
    }
    if (!contentType.includes('application/json')) {
      return res.status(502).json({ error: 'Invalid response from duels.ink', detail: 'Expected JSON response' })
    }
    try { JSON.parse(body) } catch {
      return res.status(502).json({ error: 'Invalid JSON response from duels.ink' })
    }

    res.status(200).setHeader('Content-Type', contentType)
    if (cacheControl) res.setHeader('Cache-Control', cacheControl)
    res.send(body)
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach duels.ink', detail: String(e) })
  }
}

async function proxyBinary(res: VercelResponse, url: string, auth: string, errorLabel: string) {
  try {
    const upstreamRes = await fetch(url, { headers: { Authorization: auth }, redirect: 'follow' })
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `duels.ink returned ${upstreamRes.status}` })
    }
    const buffer = await upstreamRes.arrayBuffer()
    res.status(200)
      .setHeader('Content-Type', 'application/gzip')
      .setHeader('Cache-Control', 'private, max-age=3600')
      .send(Buffer.from(buffer))
  } catch (e) {
    res.status(502).json({ error: `Failed to fetch ${errorLabel}`, detail: String(e) })
  }
}

async function handleMatchHistory(req: VercelRequest, res: VercelResponse) {
  const auth = requireBearer(req, res)
  if (!auth) return

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'endpoint') continue
    if (typeof value === 'string') params.set(key, value)
  }

  await proxyJson(
    res,
    `https://duels.ink/api/me/match-history?${params}`,
    { headers: { Authorization: auth } },
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
}

async function handleGamelog(req: VercelRequest, res: VercelResponse) {
  const auth = requireBearer(req, res)
  if (!auth) return
  const id = param(req, 'id')
  if (!id) { res.status(400).json({ error: 'Missing game id' }); return }
  await proxyBinary(res, `https://duels.ink/g/${id}`, auth, 'gamelog')
}

async function handleDeck(req: VercelRequest, res: VercelResponse) {
  const auth = requireBearer(req, res)
  if (!auth) return

  const deckId = param(req, 'id')
  const personalStats = param(req, 'personalStats')

  let url: string
  if (personalStats) {
    if (!deckId) { res.status(400).json({ error: 'Missing id (deckId) parameter' }); return }
    const params = new URLSearchParams({ deckId })
    const source = param(req, 'source')
    if (source) params.set('source', source)
    url = `https://duels.ink/api/account/personal-stats?${params}`
  } else {
    url = deckId
      ? `https://duels.ink/api/decks/${encodeURIComponent(deckId)}`
      : 'https://duels.ink/api/decks'
  }

  await proxyJson(res, url, { headers: { Authorization: auth } }, 'max-age=60, stale-while-revalidate=30')
}

async function handleStats(req: VercelRequest, res: VercelResponse) {
  const queue = param(req, 'queue')
  const period = param(req, 'period')
  if (!queue) { res.status(400).json({ error: 'Missing queue parameter' }); return }
  if (!period) { res.status(400).json({ error: 'Missing period parameter' }); return }

  // `era` is the documented way to scope to one card-set era (keys come from
  // meta.eras of any response). Omitted only by the client's era-key lookup.
  let url = `https://duels.ink/api/stats/meta?queue=${encodeURIComponent(queue)}&period=${encodeURIComponent(period)}`
  const era = param(req, 'era')
  if (era) url += `&era=${encodeURIComponent(era)}`
  const ranks = param(req, 'ranks')
  if (ranks) url += `&ranks=${encodeURIComponent(ranks)}`

  try {
    const upstreamRes = await fetch(url)
    if (!upstreamRes.ok) {
      res.status(upstreamRes.status).json({ error: `duels.ink returned ${upstreamRes.status}` })
      return
    }
    res.status(200).setHeader('Cache-Control', 'public, max-age=3600').json(await upstreamRes.json())
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch stats', detail: String(e) })
  }
}

const HANDLERS: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<void>> = {
  'match-history': handleMatchHistory,
  'gamelog': handleGamelog,
  'deck': handleDeck,
  'stats': handleStats,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const endpoint = param(req, 'endpoint')
  const fn = endpoint ? HANDLERS[endpoint] : undefined
  if (!fn) {
    return res.status(400).json({ error: `Unknown or missing endpoint. Expected one of: ${Object.keys(HANDLERS).join(', ')}` })
  }
  await fn(req, res)
}

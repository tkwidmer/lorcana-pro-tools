import { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseServiceClient } from './_lib/discordSupabase.js'

// Best-effort sync: on sign-in, the client (src/context/AuthProvider.jsx)
// calls this once per session to add the signed-in user's email to the
// site's Substack mailing list. Substack has no official API for this —
// `/api/v1/free` is the same undocumented endpoint Substack's own embed
// signup form posts to. The caller's email is never trusted from the
// request body; it's always re-derived from their verified Supabase
// session so this endpoint can't be used to subscribe arbitrary addresses.
export const config = {
  maxDuration: 10,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' })
  }
  const jwt = auth.slice('Bearer '.length)

  const publicationUrl = process.env.SUBSTACK_PUBLICATION_URL
  if (!publicationUrl) {
    console.error('subscribe-substack: SUBSTACK_PUBLICATION_URL is not set')
    return res.status(500).json({ error: 'Substack sync is not configured' })
  }

  let email: string | undefined
  try {
    const supabase = getSupabaseServiceClient()
    const { data, error } = await supabase.auth.getUser(jwt)
    if (error || !data.user?.email) {
      console.error('subscribe-substack getUser rejected token:', error?.message ?? 'no user returned')
      return res.status(401).json({ error: 'Invalid session' })
    }
    email = data.user.email
  } catch (err) {
    console.error('subscribe-substack auth check failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Substack sync is temporarily unavailable' })
  }

  try {
    const response = await fetch(`${publicationUrl}/api/v1/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email }),
    })

    if (!response.ok) {
      console.error(`subscribe-substack: Substack returned HTTP ${response.status}`)
      return res.status(200).json({ ok: false, reason: `substack_http_${response.status}` })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('subscribe-substack: request to Substack failed:', err instanceof Error ? err.message : err)
    return res.status(200).json({ ok: false, reason: 'network_error' })
  }
}

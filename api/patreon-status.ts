import { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseServiceClient } from './_lib/discordSupabase.js'
import { findLinkByUserId, deleteLinkForUser, applyPledgeStateToProfile } from './_lib/patreonSupabase.js'

// Lets SettingsPage read/disconnect the caller's own Patreon link without
// needing RLS access to patreon_links (which has zero client-facing
// policies — see supabase/migrations/006_patreon_links.sql). Every caller
// must present their own Supabase session JWT, verified here exactly like
// api/duels-tokens.ts verifies its callers.
async function requireUser(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer token' })
    return null
  }
  const jwt = auth.slice('Bearer '.length)
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) {
    console.error('patreon-status getUser rejected token:', error?.message ?? 'no user returned')
    res.status(401).json({ error: 'Invalid session' })
    return null
  }
  return data.user.id
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let userId: string | null
  try {
    userId = await requireUser(req, res)
  } catch (err) {
    console.error('patreon-status auth check failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Patreon status is temporarily unavailable' })
  }
  if (!userId) return

  try {
    if (req.method === 'GET') {
      const link = await findLinkByUserId(userId)
      if (!link) return res.status(200).json({ connected: false })
      return res.status(200).json({
        connected: true,
        patronStatus: link.patron_status,
        lastSyncedAt: link.last_synced_at,
      })
    }

    if (req.method === 'DELETE') {
      await deleteLinkForUser(userId)
      // Revoking access on disconnect only ever touches Patreon-sourced
      // grants — same guard as the webhook/reconciliation paths.
      await applyPledgeStateToProfile(userId, false)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('patreon-status request failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load Patreon status' })
  }
}

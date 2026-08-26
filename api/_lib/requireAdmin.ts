import { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseServiceClient } from './discordSupabase.js'

// Verifies the caller's Supabase session JWT, then checks that user's
// `profiles.supporter_tier` is 'admin'. Used by api/tournament-history.ts's
// import endpoint, which writes to tables with zero RLS policies (see
// supabase/migrations/008_tournament_history.sql) — only this server-side
// check stands between an arbitrary signed-in user and writing tournament
// archive data.
//
// Mirrors api/duels-tokens.ts's requireUser() JWT-verification pattern, with
// an added tier check. The bootstrap admin-email fallback in
// supabase/migrations/002_admin.sql doesn't need to be replicated here — it
// only exists so the very first admin could grant themselves admin tier
// before any row had supporter_tier = 'admin'; by the time this route is
// used, that row already has the tier set, so the plain check covers them.

export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer token' })
    return null
  }
  const jwt = auth.slice('Bearer '.length)
  const supabase = getSupabaseServiceClient()

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
  if (userError || !userData.user) {
    console.error('requireAdmin getUser rejected token:', userError?.message ?? 'no user returned')
    res.status(401).json({ error: 'Invalid session' })
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('supporter_tier')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (profileError || profile?.supporter_tier !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return null
  }

  return userData.user.id
}

// Verifies only that the caller has a valid Supabase session (any signed-in
// user) — used by the read endpoints, which don't need admin/supporter tier
// re-checked server-side (see api/tournament-history.ts), just abuse/cost
// control on a route that hits our own database rather than proxying an
// external API.
export async function requireSession(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer token' })
    return null
  }
  const jwt = auth.slice('Bearer '.length)
  const supabase = getSupabaseServiceClient()

  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) {
    console.error('requireSession getUser rejected token:', error?.message ?? 'no user returned')
    res.status(401).json({ error: 'Invalid session' })
    return null
  }
  return data.user.id
}

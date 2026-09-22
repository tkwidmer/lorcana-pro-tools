import { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseServiceClient } from './_lib/discordSupabase.js'
import { exchangeCodeForTokens, fetchProfile, checkCommunityAccess, listActiveSubscribers } from './_lib/metafyApi.js'
import {
  upsertMetafyLink,
  applyMetafyStateToProfile,
  findLinkByUserId,
  listAllLinks,
  deleteLinkForUser,
  MetafyLinkRow,
} from './_lib/metafySupabase.js'

// Consolidated Metafy route, dispatched by ?endpoint= to stay under Vercel
// Hobby's 12-function cap (see CLAUDE.md "Function budget").
//
// There's no webhook endpoint here: Metafy's webhooks are Partner-only
// (https://dev.metafy.gg/api-reference/v1/webhooks), so the reconcile tick
// is the *only* revoke path and runs every 30 minutes accordingly (see
// .github/workflows/metafy-reconcile-tick.yml).
export const config = {
  maxDuration: 60,
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function callbackRedirectUri(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = req.headers.host
  return `${proto}://${host}/api/metafy?endpoint=callback`
}

// ---- endpoint=callback ----
// Metafy redirects the browser here after the user approves the OAuth
// consent screen. `state` carries the initiating user's Supabase access
// token, verified server-side via auth.getUser() (the same pattern
// api/duels-tokens.ts uses for its Bearer auth), since this is a plain
// browser redirect with no other way to identify the logged-in user.
//
// The freshly-issued access token is used for exactly one call
// (checkCommunityAccess) to grant/revoke immediately on connect, then
// discarded — it's never written to metafy_links. See
// api/_lib/metafySupabase.ts for why reconciliation doesn't need it back.
async function handleCallback(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined
  const state = typeof req.query.state === 'string' ? req.query.state : undefined
  const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined

  if (oauthError || !code || !state) {
    res.redirect(302, '/settings?metafy=error')
    return
  }

  const communityId = process.env.METAFY_COMMUNITY_ID
  if (!communityId) {
    console.error('metafy callback: missing METAFY_COMMUNITY_ID')
    res.redirect(302, '/settings?metafy=error')
    return
  }

  try {
    const supabase = getSupabaseServiceClient()
    const { data: userData, error: userError } = await supabase.auth.getUser(state)
    if (userError || !userData.user) {
      console.error('metafy callback rejected state token:', userError?.message ?? 'no user returned')
      res.redirect(302, '/settings?metafy=error')
      return
    }
    const userId = userData.user.id

    const tokens = await exchangeCodeForTokens(code, callbackRedirectUri(req))
    const profile = await fetchProfile(tokens.access_token)
    const access = await checkCommunityAccess(tokens.access_token, communityId)

    await upsertMetafyLink({
      userId,
      metafyUserId: profile.metafyUserId,
      hasAccess: access.hasAccess,
      tierId: access.tierId,
    })
    await applyMetafyStateToProfile(userId, access.hasAccess)

    res.redirect(302, '/settings?metafy=connected')
  } catch (err) {
    console.error('metafy callback failed:', err instanceof Error ? err.message : err)
    res.redirect(302, '/settings?metafy=error')
  }
}

// ---- endpoint=status ----
// Lets SettingsPage read/disconnect the caller's own Metafy link without
// needing RLS access to metafy_links. Every caller must present their own
// Supabase session JWT, verified the same way as the callback above.
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
    console.error('metafy status getUser rejected token:', error?.message ?? 'no user returned')
    res.status(401).json({ error: 'Invalid session' })
    return null
  }
  return data.user.id
}

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  let userId: string | null
  try {
    userId = await requireUser(req, res)
  } catch (err) {
    console.error('metafy status auth check failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Metafy status is temporarily unavailable' })
    return
  }
  if (!userId) return

  try {
    if (req.method === 'GET') {
      const link = await findLinkByUserId(userId)
      if (!link) {
        res.status(200).json({ connected: false })
        return
      }
      res.status(200).json({
        connected: true,
        hasAccess: link.has_access,
        tierId: link.tier_id,
        lastSyncedAt: link.last_synced_at,
      })
      return
    }

    if (req.method === 'DELETE') {
      await deleteLinkForUser(userId)
      // Revoking access on disconnect only ever touches Metafy-sourced
      // grants — same guard as the reconcile tick.
      await applyMetafyStateToProfile(userId, false)
      res.status(200).json({ ok: true })
      return
    }

    res.setHeader('Allow', 'GET, DELETE')
    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('metafy status request failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to load Metafy status' })
  }
}

// ---- endpoint=reconcile-tick ----
// The only grant/revoke path (Metafy webhooks are Partner-only — see the
// file-level comment). Runs every 30 minutes via
// .github/workflows/metafy-reconcile-tick.yml, same CRON_SECRET-gated
// shared-secret pattern as api/discord-tournament-tick.ts.
//
// One owner-scoped API call (listActiveSubscribers) replaces re-polling
// each linked user's own OAuth token — see api/_lib/metafyApi.ts.
async function handleReconcileTick(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const expectedSecret = process.env.CRON_SECRET
  const authHeader = headerString(req.headers.authorization)

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const [links, subscribers] = await Promise.all([listAllLinks(), listActiveSubscribers()])
  const activeByUserId = new Map(subscribers.map((s) => [s.userId, s.tierId]))

  let granted = 0
  let revoked = 0
  let unchanged = 0
  let errors = 0

  await Promise.all(
    links.map(async (link: MetafyLinkRow) => {
      try {
        const activeTierId = activeByUserId.get(link.metafy_user_id)
        const hasAccess = activeTierId !== undefined
        if (hasAccess === link.has_access) {
          unchanged += 1
          // Still touch last_synced_at so a stalled tick is visible in the
          // row, without re-deriving supporter_source/since via a redundant
          // profile write.
          await upsertMetafyLink({
            userId: link.user_id,
            metafyUserId: link.metafy_user_id,
            hasAccess,
            tierId: activeTierId ?? null,
          })
          return
        }

        await upsertMetafyLink({
          userId: link.user_id,
          metafyUserId: link.metafy_user_id,
          hasAccess,
          tierId: activeTierId ?? null,
        })
        await applyMetafyStateToProfile(link.user_id, hasAccess)
        if (hasAccess) granted += 1
        else revoked += 1
      } catch (err) {
        errors += 1
        console.error(`metafy reconcile-tick failed for link ${link.id}:`, err instanceof Error ? err.message : err)
      }
    })
  )

  res.status(200).json({ checked: links.length, granted, revoked, unchanged, errors })
}

// ---- dispatch ----
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : undefined

  switch (endpoint) {
    case 'callback':
      return handleCallback(req, res)
    case 'status':
      return handleStatus(req, res)
    case 'reconcile-tick':
      return handleReconcileTick(req, res)
    default:
      res.status(400).json({ error: 'Unknown or missing ?endpoint=' })
  }
}

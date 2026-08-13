import { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getSupabaseServiceClient } from '../_lib/discordSupabase.js'
import {
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchIdentity,
  selectCampaignMembership,
} from '../_lib/patreonApi.js'
import {
  upsertPatreonLink,
  applyPledgeStateToProfile,
  isActivePatron,
  findLinkByPatreonUserId,
  findLinkByUserId,
  deleteLinkForUser,
  listStaleLinks,
  getDecryptedTokens,
  PatreonLinkRow,
} from '../_lib/patreonSupabase.js'

// Single consolidated function for the whole Patreon integration, dispatched by
// the `[action]` path segment — same motivation as api/duels.ts's `?endpoint=`
// dispatch: Vercel's Hobby plan caps a deployment at 12 serverless functions,
// and the four Patreon routes this replaces took the repo to exactly that cap.
//
// Path-segment dispatch rather than `?endpoint=` because the OAuth callback
// carries `code`/`state` in the query string, and Vercel doesn't document
// whether a rewrite merges the source query into a destination that already
// has one. The legacy `/api/patreon-*` URLs (registered in the Patreon
// dashboard and in .github/workflows/patreon-reconcile-tick.yml) are preserved
// by path-only rewrites in vercel.json, so nothing external had to change.
//
// `bodyParser: false` is required by the webhook branch, which must HMAC the
// raw body. It's safe for the others because none of them read `req.body`:
// callback is a GET redirect reading `req.query`, status is GET/DELETE, and
// reconcile reads only the Authorization header. `maxDuration` is the max of
// the four originals (reconcile's 60).
export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
}

// --- Shared helpers ---

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

// Matches the query-param reader in api/duels.ts.
function param(req: VercelRequest, name: string): string | undefined {
  const v = req.query[name]
  return Array.isArray(v) ? v[0] : v
}

// Verifies the caller's own Supabase session JWT. Used by the `status` branch
// so SettingsPage can read/disconnect its own link without RLS access to
// patreon_links (which has zero client-facing policies — see
// supabase/migrations/006_patreon_links.sql). Mirrors api/duels-tokens.ts.
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
    console.error('patreon/status getUser rejected token:', error?.message ?? 'no user returned')
    res.status(401).json({ error: 'Invalid session' })
    return null
  }
  return data.user.id
}

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// --- callback: OAuth redirect target ---

// Patreon redirects the browser here after the user approves the OAuth
// consent screen (see SettingsPage.jsx's "Connect Patreon" button, which
// builds the authorize URL with `state` set to the user's own Supabase
// session access token). Since this is a plain browser redirect rather than
// a fetch call with an Authorization header, `state` is how this endpoint
// learns which logged-in user initiated the flow — it's verified the same
// way api/duels-tokens.ts verifies bearer tokens, via the service-role
// client's auth.getUser().

// The URL registered as the redirect URI in the Patreon dashboard. It stays on
// the legacy `/api/patreon-callback` path (rewritten to this function) and must
// match the `redirect_uri` SettingsPage sends with the authorize request.
function redirectUri(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = req.headers.host
  return `${proto}://${host}/api/patreon-callback`
}

async function handleCallback(req: VercelRequest, res: VercelResponse) {
  const code = param(req, 'code')
  const state = param(req, 'state')
  const oauthError = param(req, 'error')

  if (oauthError || !code || !state) {
    res.redirect(302, '/settings?patreon=error')
    return
  }

  try {
    const supabase = getSupabaseServiceClient()
    const { data: userData, error: userError } = await supabase.auth.getUser(state)
    if (userError || !userData.user) {
      console.error('patreon/callback rejected state token:', userError?.message ?? 'no user returned')
      res.redirect(302, '/settings?patreon=error')
      return
    }
    const userId = userData.user.id

    const tokens = await exchangeCodeForTokens(code, redirectUri(req))
    const identity = await fetchIdentity(tokens.access_token)
    const membership = selectCampaignMembership(identity)

    await upsertPatreonLink({
      userId,
      patreonUserId: identity.patreonUserId,
      patronStatus: membership?.patronStatus ?? null,
      lastChargeStatus: membership?.lastChargeStatus ?? null,
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      },
    })

    await applyPledgeStateToProfile(
      userId,
      isActivePatron({ patron_status: membership?.patronStatus, last_charge_status: membership?.lastChargeStatus })
    )

    res.redirect(302, '/settings?patreon=connected')
  } catch (err) {
    console.error('patreon/callback failed:', err instanceof Error ? err.message : err)
    res.redirect(302, '/settings?patreon=error')
  }
}

// --- webhook: Patreon pledge events ---

// Patreon requires the raw request body to verify its HMAC-MD5 signature —
// same reasoning as api/discord-interactions.ts's Ed25519 verification, just
// a different primitive (X-Patreon-Signature + HMAC-MD5 rather than Discord's
// Ed25519 headers). That's why `config.api.bodyParser` is false above.

// Event names/payload shape flagged in the implementation plan as worth
// re-checking against Patreon's current webhook docs before going live.
const PLEDGE_EVENTS = new Set(['members:pledge:create', 'members:pledge:update', 'members:pledge:delete'])

function isValidSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('md5', secret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const signatureBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length !== signatureBuf.length) return false
  return timingSafeEqual(expectedBuf, signatureBuf)
}

async function handleWebhook(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const secret = process.env.PATREON_WEBHOOK_SECRET
  const signature = headerString(req.headers['x-patreon-signature'])
  const event = headerString(req.headers['x-patreon-event'])
  const rawBody = await readRawBody(req)

  if (!secret || !signature || !event) {
    res.status(401).send('Bad request signature')
    return
  }

  if (!isValidSignature(rawBody, signature, secret)) {
    res.status(401).send('Bad request signature')
    return
  }

  if (!PLEDGE_EVENTS.has(event)) {
    // Not an event this integration acts on — acknowledge so Patreon doesn't
    // retry/disable the webhook for it.
    res.status(200).json({ ok: true, ignored: event })
    return
  }

  try {
    const payload = JSON.parse(rawBody.toString('utf8'))
    const patreonUserId: string | undefined = payload?.data?.relationships?.user?.data?.id
    const patronStatus: string | null = payload?.data?.attributes?.patron_status ?? null
    const lastChargeStatus: string | null = payload?.data?.attributes?.last_charge_status ?? null

    if (!patreonUserId) {
      res.status(200).json({ ok: true, ignored: 'no patron id in payload' })
      return
    }

    const link = await findLinkByPatreonUserId(patreonUserId)
    if (!link) {
      // Webhook for a patron who never connected their account here.
      res.status(200).json({ ok: true, ignored: 'unlinked patron' })
      return
    }

    await upsertPatreonLink({
      userId: link.user_id,
      patreonUserId,
      patronStatus,
      lastChargeStatus,
    })
    await applyPledgeStateToProfile(
      link.user_id,
      event === 'members:pledge:delete' ? false : isActivePatron({ patron_status: patronStatus, last_charge_status: lastChargeStatus })
    )

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('patreon/webhook failed:', err instanceof Error ? err.message : err)
    // Still 200 — Patreon retries/disables the webhook on repeated failures,
    // and a transient Supabase error will be caught by the reconciliation
    // tick's next pass.
    res.status(200).json({ ok: false })
  }
}

// --- status: read/disconnect the caller's own link ---

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  let userId: string | null
  try {
    userId = await requireUser(req, res)
  } catch (err) {
    console.error('patreon/status auth check failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Patreon status is temporarily unavailable' })
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
        patronStatus: link.patron_status,
        lastSyncedAt: link.last_synced_at,
      })
      return
    }

    if (req.method === 'DELETE') {
      await deleteLinkForUser(userId)
      // Revoking access on disconnect only ever touches Patreon-sourced
      // grants — same guard as the webhook/reconciliation paths.
      await applyPledgeStateToProfile(userId, false)
      res.status(200).json({ ok: true })
      return
    }

    res.setHeader('Allow', 'GET, DELETE')
    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('patreon/status request failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Failed to load Patreon status' })
  }
}

// --- reconcile: CRON_SECRET-gated safety net ---

// Safety net for missed/disabled Patreon webhooks — called once a day by
// .github/workflows/patreon-reconcile-tick.yml, the same CRON_SECRET-gated
// shared-secret pattern as api/discord-tournament-tick.ts. Webhooks handle
// real-time grant/revoke; this just re-syncs anything that's gone stale.

const STALE_AFTER_HOURS = 20

async function reconcileLink(link: PatreonLinkRow): Promise<'ok' | 'skipped' | 'error'> {
  try {
    const tokens = await getDecryptedTokens(link)
    if (!tokens) return 'skipped'

    // Patreon access tokens are short-lived; refresh proactively if expired
    // or expiring soon.
    const expiresAt = tokens.expiresAt ? new Date(tokens.expiresAt) : null
    const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000

    let accessToken = tokens.accessToken
    let refreshedTokens: { accessToken: string; refreshToken: string; expiresAt: string } | undefined

    if (needsRefresh) {
      const refreshed = await refreshAccessToken(tokens.refreshToken)
      accessToken = refreshed.access_token
      refreshedTokens = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }
    }

    const identity = await fetchIdentity(accessToken)
    const membership = selectCampaignMembership(identity)

    await upsertPatreonLink({
      userId: link.user_id,
      patreonUserId: link.patreon_user_id,
      patronStatus: membership?.patronStatus ?? null,
      lastChargeStatus: membership?.lastChargeStatus ?? null,
      tokens: refreshedTokens,
    })
    await applyPledgeStateToProfile(
      link.user_id,
      isActivePatron({ patron_status: membership?.patronStatus, last_charge_status: membership?.lastChargeStatus })
    )
    return 'ok'
  } catch (err) {
    console.error(`patreon/reconcile failed for link ${link.id}:`, err instanceof Error ? err.message : err)
    return 'error'
  }
}

async function handleReconcile(req: VercelRequest, res: VercelResponse) {
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

  const staleBefore = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000)
  const links = await listStaleLinks(staleBefore)

  const results = await Promise.all(links.map(reconcileLink))
  const summary = results.reduce(
    (acc, r) => ({ ...acc, [r]: acc[r] + 1 }),
    { ok: 0, skipped: 0, error: 0 } as Record<'ok' | 'skipped' | 'error', number>
  )

  res.status(200).json({ checked: links.length, ...summary })
}

// --- Dispatch ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = param(req, 'action')

  switch (action) {
    case 'callback':
      return handleCallback(req, res)
    case 'webhook':
      return handleWebhook(req, res)
    case 'status':
      return handleStatus(req, res)
    case 'reconcile':
      return handleReconcile(req, res)
    default:
      res.status(404).json({ error: 'Unknown Patreon action' })
  }
}

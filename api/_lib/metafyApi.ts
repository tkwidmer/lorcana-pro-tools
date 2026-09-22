// Thin client for Metafy's OAuth2 + API v1 endpoints, used by api/metafy.ts.
// Standalone (not shared with the client bundle) since it needs
// METAFY_CLIENT_SECRET and METAFY_API_KEY, which must never reach the
// browser. Docs: https://dev.metafy.gg/
//
// Unlike the Patreon integration, no per-user token is ever persisted: the
// OAuth callback uses the freshly-issued access token for one immediate
// access check and discards it, and reconciliation runs entirely off a
// single owner-scoped API key (METAFY_API_KEY) via the community
// subscribers list rather than re-polling each user's own token. See
// api/_lib/metafySupabase.ts.

const TOKEN_URL = 'https://metafy.gg/irk/oauth/token'
const API_BASE = 'https://metafy.gg/irk/api'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export interface MetafyTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope: string
  created_at: number
}

async function postForm(body: URLSearchParams): Promise<MetafyTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    throw new Error(`Metafy token request failed (HTTP ${response.status}): ${await response.text()}`)
  }
  return response.json()
}

export function exchangeCodeForTokens(code: string, redirectUri: string): Promise<MetafyTokenResponse> {
  return postForm(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: requireEnv('METAFY_CLIENT_ID'),
      client_secret: requireEnv('METAFY_CLIENT_SECRET'),
    })
  )
}

export interface MetafyProfile {
  metafyUserId: string
  email: string | null
}

// GET /v1/me ("Get Profile") — information about the authenticated account.
// Called once, right after the code exchange, with the user's own
// just-issued access token.
export async function fetchProfile(accessToken: string): Promise<MetafyProfile> {
  const response = await fetch(`${API_BASE}/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(`Metafy profile request failed (HTTP ${response.status}): ${await response.text()}`)
  }
  const body = await response.json()
  return {
    metafyUserId: body?.user?.id,
    email: body?.user?.email ?? null,
  }
}

export interface CommunityAccess {
  hasAccess: boolean
  tierId: string | null
}

// GET /v1/me/purchases/communities/{communityId} — whether the
// authenticated account has an active subscription to our community.
// Called once at connect-time with the user's own access token to grant
// immediately; reconciliation afterwards uses listActiveSubscribers()
// instead of re-calling this per user.
export async function checkCommunityAccess(accessToken: string, communityId: string): Promise<CommunityAccess> {
  const response = await fetch(`${API_BASE}/v1/me/purchases/communities/${encodeURIComponent(communityId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (response.status === 404) {
    // Documented as "not found" when there's no subscription record at all.
    return { hasAccess: false, tierId: null }
  }
  if (!response.ok) {
    throw new Error(`Metafy community access request failed (HTTP ${response.status}): ${await response.text()}`)
  }
  const body = await response.json()
  return {
    hasAccess: body?.community?.has_access ?? false,
    tierId: body?.community?.tier_id ?? null,
  }
}

export interface MetafySubscriber {
  userId: string
  tierId: string | null
}

// GET /v1/me/community/subscribers — every active subscriber to our own
// community, authenticated with the owner's API key (METAFY_API_KEY, scope
// `community`) rather than any individual user's OAuth token. Paginated at
// up to 100/page; the reconcile tick walks all pages once per run.
export async function listActiveSubscribers(): Promise<MetafySubscriber[]> {
  const apiKey = requireEnv('METAFY_API_KEY')
  const subscribers: MetafySubscriber[] = []
  let page = 1

  for (;;) {
    const params = new URLSearchParams({ page: String(page), per_page: '100' })
    const response = await fetch(`${API_BASE}/v1/me/community/subscribers?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!response.ok) {
      throw new Error(`Metafy subscribers request failed (HTTP ${response.status}): ${await response.text()}`)
    }
    const body = await response.json()
    const pageSubscribers: any[] = body?.subscribers ?? []
    for (const sub of pageSubscribers) {
      subscribers.push({ userId: sub.user_id, tierId: sub.tier_id ?? null })
    }

    const totalPages = body?.meta?.pagination?.total_pages
    if (!totalPages || page >= totalPages || pageSubscribers.length === 0) break
    page += 1
  }

  return subscribers
}

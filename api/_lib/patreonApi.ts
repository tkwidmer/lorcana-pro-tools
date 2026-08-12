// Thin client for Patreon's OAuth2 + API v2 endpoints, used by
// api/patreon-callback.ts and api/patreon-reconcile-tick.ts. Standalone (not
// shared with the client bundle) since it needs PATREON_CLIENT_SECRET, which
// must never reach the browser.
//
// Field/include names for the identity endpoint and the exact webhook event
// set are flagged in the implementation plan as worth re-checking against
// Patreon's current docs (https://docs.patreon.com/) before going live —
// Patreon has changed API versions (v1 -> v2) before.

const TOKEN_URL = 'https://www.patreon.com/api/oauth2/token'
const AUTHORIZE_URL = 'https://www.patreon.com/oauth2/authorize'
const IDENTITY_URL = 'https://www.patreon.com/api/oauth2/v2/identity'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = process.env.PATREON_CLIENT_ID || process.env.VITE_PATREON_CLIENT_ID
  if (!clientId) throw new Error('Missing PATREON_CLIENT_ID')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'identity identity.memberships',
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export interface PatreonTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

async function postForm(body: URLSearchParams): Promise<PatreonTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    throw new Error(`Patreon token request failed (HTTP ${response.status}): ${await response.text()}`)
  }
  return response.json()
}

export function exchangeCodeForTokens(code: string, redirectUri: string): Promise<PatreonTokenResponse> {
  return postForm(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: requireEnv('PATREON_CLIENT_ID'),
      client_secret: requireEnv('PATREON_CLIENT_SECRET'),
      redirect_uri: redirectUri,
    })
  )
}

export function refreshAccessToken(refreshToken: string): Promise<PatreonTokenResponse> {
  return postForm(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: requireEnv('PATREON_CLIENT_ID'),
      client_secret: requireEnv('PATREON_CLIENT_SECRET'),
    })
  )
}

export interface PatreonMembership {
  id: string
  campaignId: string | null
  patronStatus: string | null
  lastChargeStatus: string | null
}

export interface PatreonIdentity {
  patreonUserId: string
  email: string | null
  memberships: PatreonMembership[]
}

// Fetches the authorized patron's identity plus their membership(s), scoped
// to whatever campaign(s) they've pledged to. The caller is responsible for
// filtering `memberships` down to PATREON_CAMPAIGN_ID — a patron can back
// campaigns other than ours.
export async function fetchIdentity(accessToken: string): Promise<PatreonIdentity> {
  const params = new URLSearchParams({
    include: 'memberships,memberships.campaign',
    'fields[user]': 'email',
    'fields[member]': 'patron_status,last_charge_status',
  })
  const response = await fetch(`${IDENTITY_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(`Patreon identity request failed (HTTP ${response.status}): ${await response.text()}`)
  }
  const body = await response.json()

  const included: any[] = body.included ?? []
  const memberships: PatreonMembership[] = (body.data?.relationships?.memberships?.data ?? []).map(
    (ref: { id: string }) => {
      const member = included.find((item) => item.type === 'member' && item.id === ref.id)
      const campaignRef = member?.relationships?.campaign?.data
      return {
        id: ref.id,
        campaignId: campaignRef?.id ?? null,
        patronStatus: member?.attributes?.patron_status ?? null,
        lastChargeStatus: member?.attributes?.last_charge_status ?? null,
      }
    }
  )

  return {
    patreonUserId: body.data?.id,
    email: body.data?.attributes?.email ?? null,
    memberships,
  }
}

// Picks the membership matching this app's campaign, if PATREON_CAMPAIGN_ID
// is set; otherwise falls back to the first membership found (single-campaign
// creators only need one).
export function selectCampaignMembership(identity: PatreonIdentity): PatreonMembership | null {
  const campaignId = process.env.PATREON_CAMPAIGN_ID
  if (campaignId) {
    return identity.memberships.find((m) => m.campaignId === campaignId) ?? null
  }
  return identity.memberships[0] ?? null
}

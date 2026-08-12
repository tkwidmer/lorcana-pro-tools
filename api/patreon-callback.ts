import { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseServiceClient } from './_lib/discordSupabase.js'
import { exchangeCodeForTokens, fetchIdentity, selectCampaignMembership } from './_lib/patreonApi.js'
import { upsertPatreonLink, applyPledgeStateToProfile, isActivePatron } from './_lib/patreonSupabase.js'

// Patreon redirects the browser here after the user approves the OAuth
// consent screen (see SettingsPage.jsx's "Connect Patreon" button, which
// builds the authorize URL with `state` set to the user's own Supabase
// session access token). Since this is a plain browser redirect rather than
// a fetch call with an Authorization header, `state` is how this endpoint
// learns which logged-in user initiated the flow — it's verified the same
// way api/duels-tokens.ts verifies bearer tokens, via the service-role
// client's auth.getUser().
export const config = {
  maxDuration: 30,
}

function redirectUri(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = req.headers.host
  return `${proto}://${host}/api/patreon-callback`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined
  const state = typeof req.query.state === 'string' ? req.query.state : undefined
  const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined

  if (oauthError || !code || !state) {
    res.redirect(302, '/settings?patreon=error')
    return
  }

  try {
    const supabase = getSupabaseServiceClient()
    const { data: userData, error: userError } = await supabase.auth.getUser(state)
    if (userError || !userData.user) {
      console.error('patreon-callback rejected state token:', userError?.message ?? 'no user returned')
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
    console.error('patreon-callback failed:', err instanceof Error ? err.message : err)
    res.redirect(302, '/settings?patreon=error')
  }
}

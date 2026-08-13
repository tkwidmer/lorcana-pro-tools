import { VercelRequest, VercelResponse } from '@vercel/node'
import { refreshAccessToken, fetchIdentity, selectCampaignMembership } from './_lib/patreonApi.js'
import {
  listStaleLinks,
  getDecryptedTokens,
  upsertPatreonLink,
  applyPledgeStateToProfile,
  isActivePatron,
  PatreonLinkRow,
} from './_lib/patreonSupabase.js'

// Safety net for missed/disabled Patreon webhooks — called once a day by
// .github/workflows/patreon-reconcile-tick.yml, the same CRON_SECRET-gated
// shared-secret pattern as api/discord-tournament-tick.ts. Webhooks handle
// real-time grant/revoke; this just re-syncs anything that's gone stale.
export const config = {
  maxDuration: 60,
}

const STALE_AFTER_HOURS = 20

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

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
    console.error(`patreon-reconcile-tick failed for link ${link.id}:`, err instanceof Error ? err.message : err)
    return 'error'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

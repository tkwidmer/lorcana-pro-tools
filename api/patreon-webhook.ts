import { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { upsertPatreonLink, applyPledgeStateToProfile, findLinkByPatreonUserId, isActivePatron } from './_lib/patreonSupabase.js'

// Patreon requires the raw request body to verify its HMAC-MD5 signature, so
// this function is not compatible with Vercel's default JSON body parsing —
// same reasoning as api/discord-interactions.ts's Ed25519 verification, just
// a different primitive (Patreon uses X-Patreon-Signature + HMAC-MD5 rather
// than Discord's Ed25519 headers).
export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
}

// Event names/payload shape flagged in the implementation plan as worth
// re-checking against Patreon's current webhook docs before going live.
const PLEDGE_EVENTS = new Set(['members:pledge:create', 'members:pledge:update', 'members:pledge:delete'])

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function isValidSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('md5', secret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const signatureBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length !== signatureBuf.length) return false
  return timingSafeEqual(expectedBuf, signatureBuf)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    console.error('patreon-webhook failed:', err instanceof Error ? err.message : err)
    // Still 200 — Patreon retries/disables the webhook on repeated failures,
    // and a transient Supabase error will be caught by the reconciliation
    // tick's next pass.
    res.status(200).json({ ok: false })
  }
}

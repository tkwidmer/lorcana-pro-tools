import { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyKey } from 'discord-interactions'
import { waitUntil } from '@vercel/functions'
import { decodeQrFromImageUrl } from './_lib/discordQr.js'
import {
  extractEventId,
  fetchEventDetails,
  fetchAllStandings,
  getTournamentStructure,
  analyzeId,
  analyzeAdvancement,
} from './_lib/discordTournamentApi.js'
import { buildSummaryEmbed, buildPlayerEmbed } from './_lib/discordTournamentEmbeds.js'

// Discord requires the raw request body to verify the Ed25519 signature, so
// this function is not compatible with Vercel's default JSON body parsing.
export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
}

const PING = 1
const APPLICATION_COMMAND = 2
const PONG = 1
const DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5
const MESSAGE_COMMAND_TYPE = 3

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

class TimeoutError extends Error {}

// Leaves headroom under the platform's own hard execution limit (Vercel
// Hobby caps functions at 10s regardless of the maxDuration config above)
// so a slow run gets an explicit reply instead of being killed mid-flight
// with the interaction stuck on "thinking" forever.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`Timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

async function editOriginalReply(interaction: any, payload: Record<string, unknown>) {
  const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function handleDecodeQr(interaction: any) {
  const targetId = interaction.data.target_id
  const message = interaction.data.resolved?.messages?.[targetId]
  const images = (message?.attachments ?? []).filter((a: any) => a.content_type?.startsWith('image/'))

  if (images.length === 0) {
    return { content: 'That message has no image attachments to scan.' }
  }

  const results = await Promise.all(
    images.map(async (image: any) => {
      try {
        return { name: image.filename, decoded: await decodeQrFromImageUrl(image.url) }
      } catch (error) {
        console.error(`Failed to decode ${image.filename}:`, error)
        return { name: image.filename, decoded: null }
      }
    })
  )

  const found = results.filter((r) => r.decoded)
  if (found.length === 0) {
    return { content: "Couldn't find a QR code in that image." }
  }

  const lines = found.map((r) => (results.length > 1 ? `**${r.name}**: ${r.decoded}` : r.decoded))
  return { content: lines.join('\n') }
}

async function handleTournament(interaction: any) {
  const options: Array<{ name: string; value: string }> = interaction.data.options ?? []
  const url = options.find((o) => o.name === 'url')?.value
  const playerQuery = options.find((o) => o.name === 'player')?.value

  const eventId = extractEventId(url)
  if (!eventId) {
    return {
      content:
        "That doesn't look like a Ravensburger event URL. Expected something like `https://tcg.ravensburgerplay.com/events/12345`.",
    }
  }

  const eventDetails = await fetchEventDetails(eventId)
  const structure = getTournamentStructure(eventDetails)

  if (!structure?.currentRoundId) {
    return { content: 'Could not find an active round for this event.' }
  }

  const standings = await fetchAllStandings(structure.currentRoundId)

  if (!playerQuery) {
    return { embeds: [buildSummaryEmbed(structure, standings, url as string)] }
  }

  const query = playerQuery.toLowerCase()
  const matches = standings.filter(
    (entry) =>
      entry.user_event_status.best_identifier.toLowerCase().includes(query) ||
      entry.player.best_identifier.toLowerCase().includes(query)
  )

  if (matches.length === 0) {
    return { content: `No player matching "${playerQuery}" found in the current standings.` }
  }

  if (matches.length > 1) {
    const names = matches
      .slice(0, 10)
      .map((entry) => `${entry.user_event_status.best_identifier} (#${entry.rank})`)
      .join(', ')
    return { content: `Multiple players match "${playerQuery}": ${names}. Try a more specific name.` }
  }

  const entry = matches[0]
  const idAnalysis = analyzeId(entry, standings, structure)
  const advancementAnalysis = analyzeAdvancement(entry, structure)
  return { embeds: [buildPlayerEmbed(structure, entry, idAnalysis, advancementAnalysis, url as string)] }
}

async function handleCommand(interaction: any) {
  const { data } = interaction

  if (data.type === MESSAGE_COMMAND_TYPE && data.name === 'Decode Deck QR') {
    await editOriginalReply(interaction, await handleDecodeQr(interaction))
    return
  }

  if (data.name === 'tournament') {
    await editOriginalReply(interaction, await handleTournament(interaction))
    return
  }

  await editOriginalReply(interaction, { content: 'Unknown command.' })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const signature = headerString(req.headers['x-signature-ed25519'])
  const timestamp = headerString(req.headers['x-signature-timestamp'])
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  const rawBody = await readRawBody(req)

  if (!publicKey || !signature || !timestamp) {
    res.status(401).send('Bad request signature')
    return
  }

  const isValid = await verifyKey(rawBody, signature, timestamp, publicKey)
  if (!isValid) {
    res.status(401).send('Bad request signature')
    return
  }

  const interaction = JSON.parse(rawBody.toString('utf8'))

  if (interaction.type === PING) {
    res.status(200).json({ type: PONG })
    return
  }

  if (interaction.type !== APPLICATION_COMMAND) {
    res.status(400).json({ error: 'Unsupported interaction type' })
    return
  }

  // Acknowledge immediately (Discord requires a response within 3s). The
  // real work happens after this point — it's kept alive two ways: a
  // direct await (what the classic Node.js Functions runtime needs) and
  // waitUntil (what Vercel's Fluid Compute runtime needs instead, since it
  // may otherwise suspend the invocation once the response is sent).
  res.status(200).json({ type: DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE })

  const workPromise = withTimeout(handleCommand(interaction), 8000).catch((error) => {
    console.error('Interaction handling failed:', error)
    return editOriginalReply(interaction, {
      content:
        error instanceof TimeoutError
          ? 'That took too long to process — please try again.'
          : 'Something went wrong handling that command.',
    })
  })

  waitUntil(workPromise)
  await workPromise
}

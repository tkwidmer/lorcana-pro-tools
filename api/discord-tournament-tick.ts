import { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchEventDetails, fetchAllStandings, getTournamentStructure, analyzeId, analyzeAdvancement } from './_lib/discordTournamentApi.js'
import { buildPlayerEmbed } from './_lib/discordTournamentEmbeds.js'
import {
  listAllActiveFavorites,
  updateFavoriteSnapshot,
  deactivateFavoritesForEvent,
  FavoriteRow,
} from './_lib/discordFavorites.js'

// Called every 30 minutes by .github/workflows/tournament-tracker-tick.yml.
// Not a Discord interaction — a plain authenticated HTTP endpoint, so none
// of the signature-verification / deferred-reply machinery in
// discord-interactions.ts applies here.
export const config = {
  maxDuration: 60,
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

async function postChannelMessage(channelId: string, payload: Record<string, unknown>) {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set')

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(
      `Failed to post message to channel ${channelId} (HTTP ${response.status}): ${await response.text()}`
    )
  }
}

function groupByEvent(rows: FavoriteRow[]): Map<string, FavoriteRow[]> {
  const map = new Map<string, FavoriteRow[]>()
  for (const row of rows) {
    const list = map.get(row.event_id) ?? []
    list.push(row)
    map.set(row.event_id, list)
  }
  return map
}

interface EventResult {
  checked: number
  posted: number
  errors: number
  deactivated: number
}

async function processEvent(eventId: string, rows: FavoriteRow[]): Promise<EventResult> {
  const result: EventResult = { checked: 0, posted: 0, errors: 0, deactivated: 0 }

  try {
    const eventDetails = await fetchEventDetails(eventId)
    const structure = getTournamentStructure(eventDetails)

    if (!structure?.currentRoundId) {
      await deactivateFavoritesForEvent(eventId)
      result.deactivated = rows.length
      return result
    }

    const standings = await fetchAllStandings(structure.currentRoundId)

    for (const row of rows) {
      result.checked++
      try {
        const entry = standings.find((e) => e.player.id === row.player_id)
        if (!entry) continue // dropped, or not found in this round's standings yet

        const changed =
          entry.rank !== row.last_rank ||
          entry.record !== row.last_record ||
          entry.match_points !== row.last_match_points

        if (changed) {
          const idAnalysis = analyzeId(entry, standings, structure)
          const advancementAnalysis = analyzeAdvancement(entry, structure)
          const embed = buildPlayerEmbed(structure, entry, idAnalysis, advancementAnalysis, row.event_url)
          await postChannelMessage(row.channel_id, { embeds: [embed] })
          result.posted++
        }

        await updateFavoriteSnapshot(row.id, entry.rank, entry.record, entry.match_points)
      } catch (error) {
        result.errors++
        console.error(`Failed to process favorite ${row.id}:`, error)
      }
    }

    return result
  } catch (error) {
    console.error(`Failed to process event ${eventId}:`, error)
    result.errors += rows.length
    return result
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

  const rows = await listAllActiveFavorites()
  const byEvent = groupByEvent(rows)

  const results = await Promise.all(
    [...byEvent.entries()].map(([eventId, eventRows]) => processEvent(eventId, eventRows))
  )

  const summary = results.reduce(
    (acc, r) => ({
      checked: acc.checked + r.checked,
      posted: acc.posted + r.posted,
      errors: acc.errors + r.errors,
      deactivated: acc.deactivated + r.deactivated,
    }),
    { checked: 0, posted: 0, errors: 0, deactivated: 0 }
  )

  res.status(200).json({ events: byEvent.size, ...summary })
}

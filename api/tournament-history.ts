import { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin, requireSession } from './_lib/requireAdmin.js'
import {
  fetchEventDetailsServer,
  deriveTournamentStructure,
  fetchFinalStandings,
  fetchAllRoundMatchesServer,
} from './_lib/tournamentImport.js'
import {
  upsertEvent,
  upsertStandings,
  upsertMatches,
  getPlayerHistory,
  getHeadToHead,
  searchPlayers,
  listRecentImports,
  getAllImportedEventIds,
} from './_lib/tournamentHistorySupabase.js'
import { discoverCandidateEvents, filterRealCandidates } from './_lib/tournamentDiscovery.js'

// Single consolidated route for the caster-history archive of imported RPH
// major events (see supabase/migrations/008_tournament_history.sql), folded
// into one function dispatched by `?endpoint=` rather than one route per
// endpoint — same reason as api/duels.ts: Vercel's Hobby plan caps a
// deployment at 12 serverless functions.

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

function extractEventId(input: string): string | null {
  if (ID_RE.test(input)) return input
  const match = input.match(/\/events\/(\d+)/)
  return match ? match[1] : null
}

async function handleImport(req: VercelRequest, res: VercelResponse) {
  const userId = await requireAdmin(req, res)
  if (!userId) return

  const { eventUrl, eventId: eventIdInput } = req.body ?? {}
  const rawInput = eventUrl ?? eventIdInput
  if (!rawInput || typeof rawInput !== 'string') {
    return res.status(400).json({ error: 'eventUrl (or eventId) is required' })
  }
  const eventId = extractEventId(rawInput)
  if (!eventId || !ID_RE.test(eventId)) {
    return res.status(400).json({ error: 'Invalid event URL. Format: https://tcg.ravensburgerplay.com/events/12345' })
  }

  let eventDetails: any
  try {
    eventDetails = await fetchEventDetailsServer(eventId)
  } catch (err) {
    console.error('tournament-history import: event fetch failed:', err instanceof Error ? err.message : err)
    return res.status(502).json({ error: 'Failed to fetch event from Ravensburger Play Hub' })
  }

  const structure = deriveTournamentStructure(eventDetails)
  if (!structure.finalRoundId) {
    return res.status(400).json({ error: 'This event has no completed round with generated standings yet' })
  }

  try {
    const [standingsRaw, matches] = await Promise.all([
      fetchFinalStandings(structure.finalRoundId),
      fetchAllRoundMatchesServer(eventDetails),
    ])

    const dbEventId = await upsertEvent({
      rphEventId: eventId,
      eventName: structure.eventName,
      eventUrl: rawInput.startsWith('http') ? rawInput : `https://tcg.ravensburgerplay.com/events/${eventId}`,
      storeName: structure.storeName,
      gameplayFormat: structure.gameplayFormat,
      topCutSize: structure.topCutSize,
      totalSwissRounds: structure.totalSwissRounds,
      hasElimination: structure.hasElimination,
      startingPlayerCount: structure.startingPlayerCount,
      eventDate: eventDetails?.start_date ?? eventDetails?.event_date ?? null,
      rawEventDetails: eventDetails,
      importedBy: userId,
    })

    const standingsImported = await upsertStandings(
      dbEventId,
      standingsRaw.map((entry: any) => ({
        rphPlayerId: String(entry.player.id),
        playerName: entry.user_event_status?.best_identifier ?? entry.player?.best_identifier ?? 'Unknown',
        rank: entry.rank ?? null,
        matchPoints: entry.user_event_status?.total_match_points ?? entry.match_points ?? null,
        record: entry.record ?? null,
        madeTopCut: Boolean(
          structure.hasElimination && structure.topCutSize && entry.rank != null && entry.rank <= structure.topCutSize
        ),
      }))
    )

    const matchesImported = await upsertMatches(
      dbEventId,
      matches.map((match: any) => {
        const relationships = [...(match.player_match_relationships ?? [])].sort(
          (a: any, b: any) => a.player_order - b.player_order
        )
        const [p1, p2] = relationships
        return {
          rphMatchId: String(match.id),
          roundNumber: match.round_number,
          phaseName: match.phase_name ?? null,
          tableNumber: match.table_number ?? null,
          player1Id: String(p1?.player?.id),
          player1Name: p1?.user_event_status?.best_identifier ?? null,
          player2Id: p2?.player?.id != null ? String(p2.player.id) : null,
          player2Name: p2?.user_event_status?.best_identifier ?? null,
          winnerId: match.winning_player != null ? String(match.winning_player) : null,
          isBye: Boolean(match.match_is_bye),
          isDraw: Boolean(match.match_is_intentional_draw || match.match_is_unintentional_draw),
          gamesWonByWinner: match.games_won_by_winner ?? null,
          gamesWonByLoser: match.games_won_by_loser ?? null,
        }
      })
    )

    return res.status(200).json({
      ok: true,
      eventId,
      eventName: structure.eventName,
      standingsImported,
      matchesImported,
      roundsImported: new Set(matches.map((m: any) => m.round_number)).size,
    })
  } catch (err) {
    console.error('tournament-history import failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to store imported tournament data' })
  }
}

async function handlePlayerHistory(req: VercelRequest, res: VercelResponse) {
  const userId = await requireSession(req, res)
  if (!userId) return

  const playerId = str(req.query.playerId)
  if (!playerId) return res.status(400).json({ error: 'Missing playerId' })

  try {
    const rows = await getPlayerHistory(playerId)
    const events = rows.map((r: any) => ({
      eventId: r.event?.rph_event_id ?? null,
      eventName: r.event?.event_name ?? null,
      eventDate: r.event?.event_date ?? null,
      storeName: r.event?.store_name ?? null,
      rank: r.rank,
      matchPoints: r.match_points,
      record: r.record,
      madeTopCut: r.made_top_cut,
      topCutSize: r.event?.top_cut_size ?? null,
      startingPlayerCount: r.event?.starting_player_count ?? null,
    }))
    return res.status(200).json({
      playerId,
      playerName: rows[0]?.player_name ?? null,
      events,
      topCutCount: events.filter((e) => e.madeTopCut).length,
      eventsPlayed: events.length,
    })
  } catch (err) {
    console.error('tournament-history player-history failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load player history' })
  }
}

async function handleHeadToHead(req: VercelRequest, res: VercelResponse) {
  const userId = await requireSession(req, res)
  if (!userId) return

  const playerA = str(req.query.playerA)
  const playerB = str(req.query.playerB)
  if (!playerA || !playerB) return res.status(400).json({ error: 'playerA and playerB are required' })

  try {
    const rows = await getHeadToHead(playerA, playerB)
    const matches = rows.map((r: any) => ({
      eventId: r.event?.rph_event_id ?? null,
      eventName: r.event?.event_name ?? null,
      eventDate: r.event?.event_date ?? null,
      roundNumber: r.round_number,
      phaseName: r.phase_name,
      winnerId: r.winner_id,
      isDraw: r.is_draw,
      isBye: r.is_bye,
      gamesWonByWinner: r.games_won_by_winner,
      gamesWonByLoser: r.games_won_by_loser,
    }))

    const metRecord = matches.reduce(
      (acc, m) => {
        if (m.isDraw || !m.winnerId) acc.draws += 1
        else if (m.winnerId === playerA) acc.playerAWins += 1
        else if (m.winnerId === playerB) acc.playerBWins += 1
        return acc
      },
      { playerAWins: 0, playerBWins: 0, draws: 0 }
    )

    return res.status(200).json({ playerAId: playerA, playerBId: playerB, matches, metRecord })
  } catch (err) {
    console.error('tournament-history head-to-head failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load head-to-head history' })
  }
}

async function handleSearchPlayers(req: VercelRequest, res: VercelResponse) {
  const userId = await requireSession(req, res)
  if (!userId) return

  const q = str(req.query.q)
  if (!q || q.trim().length === 0) return res.status(200).json({ players: [] })

  try {
    const players = await searchPlayers(q.trim())
    return res.status(200).json({ players })
  } catch (err) {
    console.error('tournament-history search-players failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to search players' })
  }
}

async function handleRecentImports(req: VercelRequest, res: VercelResponse) {
  const userId = await requireAdmin(req, res)
  if (!userId) return

  try {
    const rows = await listRecentImports(20)
    return res.status(200).json({
      events: rows.map((r: any) => ({
        eventId: r.rph_event_id,
        eventName: r.event_name,
        eventDate: r.event_date,
        storeName: r.store_name,
        importedAt: r.imported_at,
        updatedAt: r.updated_at,
      })),
    })
  } catch (err) {
    console.error('tournament-history recent-imports failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load recent imports' })
  }
}

async function handleSuggestedImports(req: VercelRequest, res: VercelResponse) {
  const userId = await requireAdmin(req, res)
  if (!userId) return

  try {
    const [candidates, importedIds] = await Promise.all([discoverCandidateEvents(), getAllImportedEventIds()])

    const suggestions = filterRealCandidates(candidates)
      .filter((e) => !importedIds.has(String(e.id)))
      .sort((a, b) => new Date(b.start_datetime ?? 0).getTime() - new Date(a.start_datetime ?? 0).getTime())
      .slice(0, 30)
      .map((e) => ({
        eventId: String(e.id),
        eventName: e.name,
        eventUrl: `https://tcg.ravensburgerplay.com/events/${e.id}`,
        storeName: e.store?.name ?? null,
        startDatetime: e.start_datetime,
        startingPlayerCount: e.starting_player_count,
      }))

    // Cached briefly at the edge — this fans out to ~18 Ravensburger requests
    // per call, no need to re-run that on every page focus.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900')
    return res.status(200).json({ suggestions })
  } catch (err) {
    console.error('tournament-history suggested-imports failed:', err instanceof Error ? err.message : err)
    return res.status(502).json({ error: 'Failed to discover suggested events from Ravensburger Play Hub' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const endpoint = str(req.query.endpoint)

  if (endpoint === 'import') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    return handleImport(req, res)
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  switch (endpoint) {
    case 'player-history':
      return handlePlayerHistory(req, res)
    case 'head-to-head':
      return handleHeadToHead(req, res)
    case 'search-players':
      return handleSearchPlayers(req, res)
    case 'recent-imports':
      return handleRecentImports(req, res)
    case 'suggested-imports':
      return handleSuggestedImports(req, res)
    default:
      return res.status(400).json({ error: 'Missing or invalid endpoint param' })
  }
}

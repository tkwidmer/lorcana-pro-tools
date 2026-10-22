import { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin, requireSession } from './_lib/requireAdmin.js'
import {
  fetchEventDetailsServer,
  deriveTournamentStructure,
  deriveEventTier,
  fetchFinalStandings,
  fetchAllRoundMatchesServer,
  eventDateOf,
  eliminationPhaseName,
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
  getPairingBadges,
  listEvents,
  getWinners,
  getEventByRphId,
  getEventStandings,
  getEventMatches,
  getEventPlayerMatches,
  getPlayerMatches,
} from './_lib/tournamentHistorySupabase.js'
import { discoverCandidateEvents, filterRealCandidates } from './_lib/tournamentDiscovery.js'

// Single consolidated route for the caster-history archive of imported RPH
// major events (see supabase/migrations/008_tournament_history.sql), folded
// into one function dispatched by `?endpoint=` rather than one route per
// endpoint — same reason as api/duels.ts: Vercel's Hobby plan caps a
// deployment at 12 serverless functions.
//
// Auth: the archive reads (`events`, `event`, `event-player`, `player`,
// `player-history`, `head-to-head`, `search-players`) are public and
// edge-cached — the data only changes on admin import, so the cache is the
// abuse/cost control. `import`, `recent-imports` and `suggested-imports` are
// admin-only; `pairing-badges` needs any signed-in session.

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

const PUBLIC_CACHE = 'public, s-maxage=300, stale-while-revalidate=3600'
const SEARCH_CACHE = 'public, s-maxage=60, stale-while-revalidate=300'
const SEARCH_MIN_CHARS = 3

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
  const { templateId, tier } = deriveEventTier(eventDetails)

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
      eventDate: eventDateOf(eventDetails),
      rawEventDetails: eventDetails,
      importedBy: userId,
      eventConfigurationTemplate: templateId,
      eventTier: tier,
    })

    // Day 2: a player who played a match in the event's second Swiss phase
    // (a DLC's "Day Two Swiss"). Only counts when that phase holds fewer
    // players than started — a few side events run everyone through two
    // Swiss phases, and that isn't a cut.
    const swissPhases = (eventDetails?.tournament_phases ?? []).filter((p: any) => p.round_type === 'SWISS')
    const dayTwoPhase = swissPhases[1]?.phase_name ?? null
    const dayTwoPlayers = new Set<string>()
    if (dayTwoPhase) {
      for (const match of matches) {
        if (match.phase_name !== dayTwoPhase) continue
        for (const rel of match.player_match_relationships ?? []) {
          if (rel?.player?.id != null) dayTwoPlayers.add(String(rel.player.id))
        }
      }
    }
    const dayTwoIsCut = dayTwoPlayers.size > 0 && dayTwoPlayers.size < (structure.startingPlayerCount ?? 0)

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
        madeDayTwo: dayTwoIsCut && dayTwoPlayers.has(String(entry.player.id)),
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
      eventTier: tier,
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
      madeDayTwo: r.made_day_two,
      topCutSize: r.event?.top_cut_size ?? null,
      startingPlayerCount: r.event?.starting_player_count ?? null,
    }))
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({
      playerId,
      playerName: rows[0]?.player_name ?? null,
      events,
      topCutCount: events.filter((e) => e.madeTopCut).length,
      dayTwoCount: events.filter((e) => e.madeDayTwo).length,
      eventsPlayed: events.length,
    })
  } catch (err) {
    console.error('tournament-history player-history failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load player history' })
  }
}

async function handleHeadToHead(req: VercelRequest, res: VercelResponse) {
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

    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({ playerAId: playerA, playerBId: playerB, matches, metRecord })
  } catch (err) {
    console.error('tournament-history head-to-head failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load head-to-head history' })
  }
}

async function handleSearchPlayers(req: VercelRequest, res: VercelResponse) {
  const q = str(req.query.q)
  if (!q || q.trim().length < SEARCH_MIN_CHARS) return res.status(200).json({ players: [] })

  try {
    const players = await searchPlayers(q.trim())
    res.setHeader('Cache-Control', SEARCH_CACHE)
    return res.status(200).json({ players })
  } catch (err) {
    console.error('tournament-history search-players failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to search players' })
  }
}

function eventShape(r: any) {
  return {
    eventId: r.rph_event_id,
    eventName: r.event_name,
    eventUrl: r.event_url ?? null,
    eventDate: r.event_date ?? null,
    storeName: r.store_name ?? null,
    gameplayFormat: r.gameplay_format ?? null,
    startingPlayerCount: r.starting_player_count ?? null,
    topCutSize: r.top_cut_size ?? null,
    hasElimination: Boolean(r.has_elimination),
    totalSwissRounds: r.total_swiss_rounds ?? 0,
    eventTier: r.event_tier ?? null,
  }
}

function matchShape(r: any, eventId: string | null) {
  return {
    eventId,
    roundNumber: r.round_number,
    phaseName: r.phase_name ?? null,
    tableNumber: r.table_number ?? null,
    player1: { id: r.player1_id, name: r.player1_name ?? null },
    player2: r.player2_id ? { id: r.player2_id, name: r.player2_name ?? null } : null,
    winnerId: r.winner_id ?? null,
    isBye: Boolean(r.is_bye),
    isDraw: Boolean(r.is_draw),
    gamesWonByWinner: r.games_won_by_winner ?? null,
    gamesWonByLoser: r.games_won_by_loser ?? null,
  }
}

async function handleEvents(_req: VercelRequest, res: VercelResponse) {
  try {
    const [rows, winners] = await Promise.all([listEvents(), getWinners()])
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({
      events: rows.map((r: any) => ({ ...eventShape(r), winner: winners.get(r.id) ?? null })),
    })
  } catch (err) {
    console.error('tournament-history events failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load events' })
  }
}

async function handleEvent(req: VercelRequest, res: VercelResponse) {
  const eventId = str(req.query.eventId)
  if (!eventId || !ID_RE.test(eventId)) return res.status(400).json({ error: 'Invalid eventId' })
  try {
    const row = await getEventByRphId(eventId)
    if (!row) return res.status(404).json({ error: 'Event not found' })
    const phase = eliminationPhaseName(row.raw_event_details)
    const [standings, bracketRows] = await Promise.all([
      getEventStandings(row.id),
      phase ? getEventMatches(row.id, phase) : Promise.resolve([]),
    ])
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({
      event: eventShape(row),
      standings: standings.map((s: any) => ({
        playerId: s.rph_player_id,
        playerName: s.player_name,
        rank: s.rank,
        matchPoints: s.match_points,
        record: s.record,
        madeTopCut: Boolean(s.made_top_cut),
      })),
      bracket: bracketRows.map((m: any) => matchShape(m, eventId)),
    })
  } catch (err) {
    console.error('tournament-history event failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load event' })
  }
}

async function handleEventPlayer(req: VercelRequest, res: VercelResponse) {
  const eventId = str(req.query.eventId)
  const playerId = str(req.query.playerId)
  if (!eventId || !ID_RE.test(eventId)) return res.status(400).json({ error: 'Invalid eventId' })
  if (!playerId || !ID_RE.test(playerId)) return res.status(400).json({ error: 'Invalid playerId' })
  try {
    const row = await getEventByRphId(eventId)
    if (!row) return res.status(404).json({ error: 'Event not found' })
    const rows = await getEventPlayerMatches(row.id, playerId)
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({ matches: rows.map((m: any) => matchShape(m, eventId)) })
  } catch (err) {
    console.error('tournament-history event-player failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load player matches' })
  }
}

async function handlePlayer(req: VercelRequest, res: VercelResponse) {
  const playerId = str(req.query.playerId)
  if (!playerId || !ID_RE.test(playerId)) return res.status(400).json({ error: 'Invalid playerId' })
  try {
    const [history, matchRows] = await Promise.all([getPlayerHistory(playerId), getPlayerMatches(playerId)])
    if (history.length === 0) return res.status(404).json({ error: 'Player not found' })
    const events = history.map((r: any) => ({
      eventId: r.event?.rph_event_id ?? null,
      eventName: r.event?.event_name ?? null,
      eventDate: r.event?.event_date ?? null,
      storeName: r.event?.store_name ?? null,
      gameplayFormat: r.event?.gameplay_format ?? null,
      eventTier: r.event?.event_tier ?? null,
      rank: r.rank,
      matchPoints: r.match_points,
      record: r.record,
      madeTopCut: Boolean(r.made_top_cut),
      topCutSize: r.event?.top_cut_size ?? null,
      startingPlayerCount: r.event?.starting_player_count ?? null,
    }))
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({
      playerId,
      playerName: history[0].player_name, // getPlayerHistory sorts newest first
      events,
      matches: matchRows.map((m: any) => matchShape(m, m.event?.rph_event_id ?? null)),
    })
  } catch (err) {
    console.error('tournament-history player failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load player' })
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

const MAX_BADGE_LIST_SIZE = 500

function parseCsv(v: string | undefined): string[] {
  if (!v) return []
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function handlePairingBadges(req: VercelRequest, res: VercelResponse) {
  const userId = await requireSession(req, res)
  if (!userId) return

  const playerIds = [...new Set(parseCsv(str(req.query.playerIds)))]
  const pairKeys = [...new Set(parseCsv(str(req.query.pairKeys)))]
  const excludeEventId = str(req.query.excludeEventId) || undefined

  if (playerIds.length === 0 && pairKeys.length === 0) {
    return res.status(400).json({ error: 'playerIds or pairKeys is required' })
  }
  if (playerIds.length > MAX_BADGE_LIST_SIZE || pairKeys.length > MAX_BADGE_LIST_SIZE) {
    return res.status(400).json({ error: `Too many ids/keys — max ${MAX_BADGE_LIST_SIZE} each` })
  }

  try {
    const badges = await getPairingBadges(playerIds, pairKeys, excludeEventId)
    return res.status(200).json(badges)
  } catch (err) {
    console.error('tournament-history pairing-badges failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load pairing badges' })
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
    case 'pairing-badges':
      return handlePairingBadges(req, res)
    case 'suggested-imports':
      return handleSuggestedImports(req, res)
    case 'events':
      return handleEvents(req, res)
    case 'event':
      return handleEvent(req, res)
    case 'event-player':
      return handleEventPlayer(req, res)
    case 'player':
      return handlePlayer(req, res)
    default:
      return res.status(400).json({ error: 'Missing or invalid endpoint param' })
  }
}

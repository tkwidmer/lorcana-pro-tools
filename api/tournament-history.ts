import { VercelRequest, VercelResponse } from '@vercel/node'
import { dangerouslyDeleteByTag } from '@vercel/functions'
import { requireAdmin, requireSession, requireUserWithTier } from './_lib/requireAdmin.js'
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
  getMajorParents,
  recomputeRatings,
  getTopRatings,
  getPlayerRating,
  setStandingInks,
} from './_lib/tournamentHistorySupabase.js'
import { matchDeckInks } from './_lib/deckInks.js'
import { discoverCandidateEvents, filterRealCandidates, filterLiveCandidates } from './_lib/tournamentDiscovery.js'
import {
  listTeams,
  getTeamBySlug,
  getTeamById,
  listMembers,
  listAllMembers,
  getMemberById,
  getStandingsForPlayers,
  upsertTeam,
  upsertMember,
  deleteMember,
  dissolveTeam,
  reinstateTeam,
  listTeamsManagedBy,
  listTeamsForPlayer,
  listTeamsWithManagerEmail,
  memberCounts,
  findProfileByEmail,
} from './_lib/teamsSupabase.js'
import { groupTeamEvents, lastEventOf, canEditTeam, adminOnlyFieldsSent, isValidLogoUrl, isValidSlug } from './_lib/teams.js'
import { isMajor, isSideEvent } from './_lib/sideEvents.js'

// Single consolidated route for the caster-history archive of imported RPH
// major events (see supabase/migrations/008_tournament_history.sql), folded
// into one function dispatched by `?endpoint=` rather than one route per
// endpoint — same reason as api/duels.ts: Vercel's Hobby plan caps a
// deployment at 12 serverless functions.
//
// Auth: the archive reads (`events`, `event`, `event-player`, `player`,
// `player-history`, `head-to-head`, `search-players`, `ratings`) are public and
// edge-cached — the data only changes on admin import, so the cache is the
// abuse/cost control. `import`, `recent-imports` and `suggested-imports` are
// admin-only; `recompute-ratings` takes an admin session or the CRON_SECRET
// bearer; `pairing-badges` needs any signed-in session.
//
// Team Tracker (supabase/migrations/031_teams.sql, docs/agents/tournaments.md
// "Teams"): `teams`, `team` and `live-majors` are public and edge-cached, the
// first two under the `teams` cache tag that every team write purges;
// `my-teams` needs a session; `admin-teams` and `admin-profile-search` are
// admin-only; the POSTs `team-save`, `team-member-save`, `team-member-delete`
// and `team-dissolve` take an admin or the team's manager (canEditTeam in
// api/_lib/teams.ts), `team-reinstate` an admin.

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

const PUBLIC_CACHE = 'public, s-maxage=300, stale-while-revalidate=3600'
const SEARCH_CACHE = 'public, s-maxage=60, stale-while-revalidate=300'
const SEARCH_MIN_CHARS = 3
// Tags the edge-cached `event` read so an admin write can purge it.
const eventCacheTag = (eventId: string) => `event-${eventId}`
const TEAMS_CACHE_TAG = 'teams'
const LIVE_CACHE = 'public, s-maxage=300, stale-while-revalidate=3600'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// The logo check needs the project URL the public bucket is served from.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''

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
    const [rows, parents, rating] = await Promise.all([
      getPlayerHistory(playerId),
      getMajorParents(),
      getPlayerRating(playerId),
    ])
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
      // Shown as a finish either way; only majors are counted (sideEvents.ts).
      sideEvent: isSideEvent(r.event ?? {}, parents),
      major: isMajor(r.event ?? {}, parents),
    }))
    const majors = events.filter((e) => e.major)
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({
      playerId,
      playerName: rows[0]?.player_name ?? null,
      events,
      topCutCount: majors.filter((e) => e.madeTopCut).length,
      dayTwoCount: majors.filter((e) => e.madeDayTwo).length,
      majorsPlayed: majors.length,
      eventsPlayed: events.length,
      rating,
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
    res.setHeader('Vercel-Cache-Tag', eventCacheTag(eventId))
    return res.status(200).json({
      event: eventShape(row),
      standings: standings.map((s: any) => ({
        playerId: s.rph_player_id,
        playerName: s.player_name,
        rank: s.rank,
        matchPoints: s.match_points,
        record: s.record,
        madeTopCut: Boolean(s.made_top_cut),
        inks: s.inks,
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
    const [history, matchRows, rating, teamRows] = await Promise.all([
      getPlayerHistory(playerId),
      getPlayerMatches(playerId),
      getPlayerRating(playerId),
      listTeamsForPlayer(playerId),
    ])
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
      inks: r.inks ?? null,
      topCutSize: r.event?.top_cut_size ?? null,
      startingPlayerCount: r.event?.starting_player_count ?? null,
    }))
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    res.setHeader('Vercel-Cache-Tag', TEAMS_CACHE_TAG) // team badges: purged by every team write
    return res.status(200).json({
      playerId,
      playerName: history[0].player_name, // getPlayerHistory sorts newest first
      events,
      matches: matchRows.map((m: any) => matchShape(m, m.event?.rph_event_id ?? null)),
      rating,
      teams: teamRows
        .filter((t) => t.team)
        .map((t) => ({
          slug: t.team!.slug,
          name: t.team!.name,
          joinedOn: t.joined_on,
          leftOn: t.left_on,
          disbandedOn: t.team!.disbanded_on,
        })),
    })
  } catch (err) {
    console.error('tournament-history player failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load player' })
  }
}

const RATINGS_LIMIT = 100

// The leaderboard: the top established players, each with the change from
// their previous rated event.
async function handleRatings(_req: VercelRequest, res: VercelResponse) {
  try {
    const rows = await getTopRatings(RATINGS_LIMIT)
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    return res.status(200).json({
      updatedAt: rows[0]?.updated_at ?? null,
      players: rows.map((r: any, i: number) => {
        const prev = r.history[r.history.length - 2]
        return {
          rank: i + 1,
          playerId: r.player_id,
          playerName: r.player_name,
          rating: Number(r.rating),
          rd: Number(r.rd),
          matches: r.matches,
          wins: r.wins,
          losses: r.losses,
          draws: r.draws,
          lastEventDate: r.last_event_date,
          delta: prev ? Number(r.rating) - prev.rating : null,
        }
      }),
    })
  } catch (err) {
    console.error('tournament-history ratings failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to load ratings' })
  }
}

// Rebuilds every rating. The nightly workflow (.github/workflows/
// ratings-recompute.yml) sends the CRON_SECRET bearer; the admin import
// page sends an admin session.
async function handleRecomputeRatings(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  const isCron = Boolean(cronSecret) && req.headers.authorization === `Bearer ${cronSecret}`
  if (!isCron && !(await requireAdmin(req, res))) return

  const started = Date.now()
  try {
    const players = await recomputeRatings()
    return res.status(200).json({ players, elapsedMs: Date.now() - started })
  } catch (err) {
    console.error('tournament-history recompute-ratings failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to recompute ratings' })
  }
}

// Admin upload of an inkdecks.com decklist export for one archived event:
// each deck's author is matched to a standing by exact name (deckInks.ts) and
// that standing's ink pair is set. Returns what was set and what was not, so
// the admin can see which authors need a second look.
async function handleInkPairs(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return
  const { eventId, decks } = req.body ?? {}
  if (typeof eventId !== 'string' || !ID_RE.test(eventId)) return res.status(400).json({ error: 'Invalid eventId' })
  if (!Array.isArray(decks) || decks.length === 0) return res.status(400).json({ error: 'decks must be a non-empty array' })
  try {
    const row = await getEventByRphId(eventId)
    if (!row) return res.status(404).json({ error: 'Event not found' })
    const match = matchDeckInks(await getEventStandings(row.id), decks)
    await setStandingInks(row.id, match.updates)
    // Delete, not invalidate: invalidate would serve the stale copy once more.
    await dangerouslyDeleteByTag(eventCacheTag(eventId))
    return res.status(200).json(match)
  } catch (err) {
    console.error('tournament-history ink-pairs failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to save ink pairs' })
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
      .map((e) => ({
        eventId: String(e.id),
        eventName: e.name,
        label: e.label,
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


// ---------------------------------------------------------------------------
// Team Tracker

const errMsg = (err: unknown) => (err instanceof Error ? err.message : err)

// `id` is the uuid writes address; it carries no access by itself.
function teamShape(t: any) {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    url: t.url ?? null,
    logoUrl: t.logo_url ?? null,
    disbandedOn: t.disbanded_on ?? null,
  }
}

function memberShape(m: any) {
  return { id: m.id, playerId: m.rph_player_id, playerName: m.player_name, joinedOn: m.joined_on, leftOn: m.left_on }
}

async function handleTeams(_req: VercelRequest, res: VercelResponse) {
  try {
    const [teams, members] = await Promise.all([listTeams(), listAllMembers()])
    // ponytail: one standings query for every member of every team; page it per team if the directory passes a few thousand members
    const rows = await getStandingsForPlayers(Array.from(new Set(members.map((m) => m.rph_player_id))))
    const out = teams.map((t) => {
      const mine = members.filter((m) => m.team_id === t.id)
      const ids = new Set(mine.map((m) => m.rph_player_id))
      const events = groupTeamEvents(mine, rows.filter((r) => ids.has(r.rph_player_id)))
      const current = mine.filter((m) => m.left_on === null)
      return {
        ...teamShape(t),
        memberCount: current.length,
        formerCount: mine.length - current.length,
        // The current roster, so Tournament Lookup can rank every team in a
        // live event from one read.
        members: current.map((m) => ({ playerId: m.rph_player_id, playerName: m.player_name })),
        lastEvent: lastEventOf(events),
      }
    })
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    res.setHeader('Vercel-Cache-Tag', TEAMS_CACHE_TAG)
    return res.status(200).json({ teams: out })
  } catch (err) {
    console.error('tournament-history teams failed:', errMsg(err))
    return res.status(500).json({ error: 'Failed to load teams' })
  }
}

async function handleTeam(req: VercelRequest, res: VercelResponse) {
  const slug = str(req.query.slug)
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' })
  try {
    const team = await getTeamBySlug(slug)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const members = await listMembers(team.id)
    const rows = await getStandingsForPlayers(Array.from(new Set(members.map((m) => m.rph_player_id))))
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    res.setHeader('Vercel-Cache-Tag', TEAMS_CACHE_TAG)
    return res.status(200).json({
      team: teamShape(team),
      members: members.map(memberShape),
      events: groupTeamEvents(members, rows),
    })
  } catch (err) {
    console.error('tournament-history team failed:', errMsg(err))
    return res.status(500).json({ error: 'Failed to load team' })
  }
}

async function handleLiveMajors(_req: VercelRequest, res: VercelResponse) {
  try {
    const live = filterLiveCandidates(await discoverCandidateEvents(), new Date())
    res.setHeader('Cache-Control', LIVE_CACHE)
    return res.status(200).json({
      events: live.map((e) => ({
        eventId: String(e.id),
        name: e.name,
        label: e.label,
        storeName: e.store?.name ?? null,
        startDatetime: e.start_datetime,
        displayStatus: e.display_status,
        playerCount: Math.max(e.registered_user_count ?? 0, e.starting_player_count ?? 0),
      })),
    })
  } catch (err) {
    console.error('tournament-history live-majors failed:', errMsg(err))
    return res.status(502).json({ error: 'Failed to discover live events from Ravensburger Play Hub' })
  }
}

async function handleMyTeams(req: VercelRequest, res: VercelResponse) {
  const user = await requireUserWithTier(req, res)
  if (!user) return
  try {
    return res.status(200).json({ admin: user.isAdmin, teams: await listTeamsManagedBy(user.id) })
  } catch (err) {
    console.error('tournament-history my-teams failed:', errMsg(err))
    return res.status(500).json({ error: 'Failed to load your teams' })
  }
}

async function handleAdminTeams(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return
  try {
    const [teams, counts] = await Promise.all([listTeamsWithManagerEmail(), memberCounts()])
    return res.status(200).json({
      teams: teams.map((t) => ({
        ...teamShape(t),
        managerUserId: t.manager_user_id,
        managerEmail: t.manager_email,
        ...(counts.get(t.id) ?? { current: 0, former: 0 }),
      })),
    })
  } catch (err) {
    console.error('tournament-history admin-teams failed:', errMsg(err))
    return res.status(500).json({ error: 'Failed to load teams' })
  }
}

async function handleAdminProfileSearch(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return
  const q = str(req.query.q)?.trim()
  if (!q || q.length < SEARCH_MIN_CHARS) return res.status(200).json({ profiles: [] })
  try {
    return res.status(200).json({ profiles: await findProfileByEmail(q) })
  } catch (err) {
    console.error('tournament-history admin-profile-search failed:', errMsg(err))
    return res.status(500).json({ error: 'Failed to search users' })
  }
}

// Loads the team and applies canEditTeam, writing 400/401/403/404/409
// itself; returns the caller and the team when the write may proceed.
async function loadEditableTeam(req: VercelRequest, res: VercelResponse, teamId: unknown, action: 'write' | 'reinstate') {
  const user = await requireUserWithTier(req, res)
  if (!user) return null
  if (typeof teamId !== 'string' || !UUID_RE.test(teamId)) {
    res.status(400).json({ error: 'Invalid team id' })
    return null
  }
  const team = await getTeamById(teamId)
  if (!team) {
    res.status(404).json({ error: 'Team not found' })
    return null
  }
  const verdict = canEditTeam(user, team, action)
  if (verdict === 'forbidden') {
    res.status(403).json({ error: "Only this team's manager or an admin can do that" })
    return null
  }
  if (verdict === 'disbanded') {
    res.status(409).json({ error: 'Team is disbanded' })
    return null
  }
  return { user, team }
}

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === '23505'

async function handleTeamSave(req: VercelRequest, res: VercelResponse) {
  const body = req.body ?? {}
  const { id, slug, name, url, logoUrl, managerUserId } = body
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > 80) {
    return res.status(400).json({ error: 'Name must be 1–80 characters' })
  }
  if (url != null && url !== '' && !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'Link must start with http' })
  if (logoUrl != null && logoUrl !== '' && !isValidLogoUrl(logoUrl, SUPABASE_URL)) {
    return res.status(400).json({ error: 'Logo must be an uploaded file' })
  }
  if (managerUserId != null && !UUID_RE.test(managerUserId)) return res.status(400).json({ error: 'Invalid manager' })
  const patch = { name: name.trim(), url: url || null, logo_url: logoUrl || null }
  try {
    if (!id) {
      if (!(await requireAdmin(req, res))) return
      if (!isValidSlug(slug)) return res.status(400).json({ error: 'Slug must be 2–48 lowercase letters, digits and hyphens' })
      const row = await upsertTeam({ ...patch, slug, manager_user_id: managerUserId ?? null })
      await dangerouslyDeleteByTag(TEAMS_CACHE_TAG)
      return res.status(200).json({ team: teamShape(row) })
    }
    const ctx = await loadEditableTeam(req, res, id, 'write')
    if (!ctx) return
    if (!ctx.user.isAdmin && adminOnlyFieldsSent(body)) {
      return res.status(403).json({ error: 'Only an admin can change the slug or manager' })
    }
    if (slug !== undefined && !isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' })
    const row = await upsertTeam({
      id,
      ...patch,
      ...(slug !== undefined && { slug }),
      ...(managerUserId !== undefined && { manager_user_id: managerUserId }),
    })
    await dangerouslyDeleteByTag(TEAMS_CACHE_TAG)
    return res.status(200).json({ team: teamShape(row) })
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: 'That slug is taken' })
    console.error('tournament-history team-save failed:', errMsg(err))
    return res.status(500).json({ error: 'Failed to save team' })
  }
}

async function handleTeamMemberSave(req: VercelRequest, res: VercelResponse) {
  const { id, teamId, playerId, playerName, joinedOn, leftOn } = req.body ?? {}
  if (typeof playerId !== 'string' || !ID_RE.test(playerId)) return res.status(400).json({ error: 'Invalid playerId' })
  if (typeof playerName !== 'string' || !playerName.trim()) return res.status(400).json({ error: 'playerName required' })
  // joinedOn may be empty: an unknown start counts from the beginning of the archive.
  if (joinedOn != null && joinedOn !== '' && (typeof joinedOn !== 'string' || !DATE_RE.test(joinedOn))) {
    return res.status(400).json({ error: 'joinedOn must be yyyy-mm-dd' })
  }
  if (leftOn != null && leftOn !== '' && (typeof leftOn !== 'string' || !DATE_RE.test(leftOn))) {
    return res.status(400).json({ error: 'leftOn must be yyyy-mm-dd' })
  }
  if (joinedOn && leftOn && leftOn < joinedOn) return res.status(400).json({ error: 'leftOn is before joinedOn' })
  // No future dates: dissolve_team() closes open rows on today's date, and a
  // membership nobody has yet would make the client and server disagree.
  const today = new Date().toISOString().slice(0, 10)
  if ((joinedOn && joinedOn > today) || (leftOn && leftOn > today)) return res.status(400).json({ error: 'Dates cannot be in the future' })
  if (id !== undefined && (typeof id !== 'string' || !UUID_RE.test(id))) return res.status(400).json({ error: 'Invalid id' })
  const ctx = await loadEditableTeam(req, res, teamId, 'write')
  if (!ctx) return
  try {
    if (id) {
      const existing = await getMemberById(id)
      if (!existing || existing.team_id !== teamId) return res.status(404).json({ error: 'Member not found' })
    }
    const row = await upsertMember({
      ...(id && { id }),
      team_id: teamId,
      rph_player_id: playerId,
      player_name: playerName.trim(),
      joined_on: joinedOn || null,
      left_on: leftOn || null,
    })
    await dangerouslyDeleteByTag(TEAMS_CACHE_TAG)
    return res.status(200).json({ member: memberShape(row) })
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: 'Already on this team' })
    console.error('tournament-history team-member-save failed:', errMsg(err))
    return res.status(500).json({ error: 'Failed to save member' })
  }
}

async function handleTeamMemberDelete(req: VercelRequest, res: VercelResponse) {
  const { id } = req.body ?? {}
  if (typeof id !== 'string' || !UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const existing = await getMemberById(id)
    if (!existing) return res.status(404).json({ error: 'Member not found' })
    const ctx = await loadEditableTeam(req, res, existing.team_id, 'write')
    if (!ctx) return
    await deleteMember(id)
    await dangerouslyDeleteByTag(TEAMS_CACHE_TAG)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('tournament-history team-member-delete failed:', errMsg(err))
    return res.status(500).json({ error: 'Failed to delete member' })
  }
}

async function handleTeamDissolve(req: VercelRequest, res: VercelResponse) {
  const ctx = await loadEditableTeam(req, res, req.body?.id, 'write')
  if (!ctx) return
  try {
    const disbandedOn = await dissolveTeam(ctx.team.id)
    await dangerouslyDeleteByTag(TEAMS_CACHE_TAG)
    return res.status(200).json({ disbandedOn })
  } catch (err) {
    // P0003: dissolve_team() found it already disbanded (a race with another editor).
    if ((err as { code?: string } | null)?.code === 'P0003') return res.status(409).json({ error: 'Team is disbanded' })
    console.error('tournament-history team-dissolve failed:', errMsg(err))
    return res.status(500).json({ error: 'Failed to dissolve team' })
  }
}

async function handleTeamReinstate(req: VercelRequest, res: VercelResponse) {
  const ctx = await loadEditableTeam(req, res, req.body?.id, 'reinstate')
  if (!ctx) return
  if (!ctx.team.disbanded_on) return res.status(409).json({ error: 'Team is not disbanded' })
  try {
    const reopened = await reinstateTeam(ctx.team.id)
    await dangerouslyDeleteByTag(TEAMS_CACHE_TAG)
    return res.status(200).json({ reopened })
  } catch (err) {
    console.error('tournament-history team-reinstate failed:', errMsg(err))
    return res.status(500).json({ error: 'Failed to reinstate team' })
  }
}

const TEAM_POST_ENDPOINTS: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<unknown>> = {
  'team-save': handleTeamSave,
  'team-member-save': handleTeamMemberSave,
  'team-member-delete': handleTeamMemberDelete,
  'team-dissolve': handleTeamDissolve,
  'team-reinstate': handleTeamReinstate,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const endpoint = str(req.query.endpoint)

  const teamPost = endpoint && Object.hasOwn(TEAM_POST_ENDPOINTS, endpoint) ? TEAM_POST_ENDPOINTS[endpoint] : undefined
  if (endpoint === 'import' || endpoint === 'recompute-ratings' || endpoint === 'ink-pairs' || teamPost) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    if (teamPost) return teamPost(req, res)
    if (endpoint === 'ink-pairs') return handleInkPairs(req, res)
    return endpoint === 'import' ? handleImport(req, res) : handleRecomputeRatings(req, res)
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
    case 'ratings':
      return handleRatings(req, res)
    case 'teams':
      return handleTeams(req, res)
    case 'team':
      return handleTeam(req, res)
    case 'live-majors':
      return handleLiveMajors(req, res)
    case 'my-teams':
      return handleMyTeams(req, res)
    case 'admin-teams':
      return handleAdminTeams(req, res)
    case 'admin-profile-search':
      return handleAdminProfileSearch(req, res)
    default:
      return res.status(400).json({ error: 'Missing or invalid endpoint param' })
  }
}

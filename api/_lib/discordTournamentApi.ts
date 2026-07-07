// Standalone port of src/lib/tournamentApi.js for the Discord /tournament
// command. The web app calls its own /api/tournament Vercel proxy; this
// module is itself a Vercel function, so it talks to the (public,
// unauthenticated) Ravensburger API directly.
const RAVEN_BASE = 'https://api.ravensburgerplay.com/api/v2'

// Tournament/round IDs are short alphanumeric tokens. Reject anything else
// before interpolating into the upstream URL.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function assertValidId(id: string | null | undefined, label: string) {
  if (!id || !ID_RE.test(id)) {
    throw new Error(`Invalid ${label}`)
  }
}

async function ravenFetch(path: string) {
  const response = await fetch(`${RAVEN_BASE}${path}`)
  if (!response.ok) {
    throw new Error(`Tournament API error (HTTP ${response.status})`)
  }
  return response.json()
}

export function extractEventId(url: string | null | undefined): string | null {
  const match = String(url).match(/\/events\/(\d+)/)
  return match ? match[1] : null
}

export async function fetchEventDetails(eventId: string) {
  assertValidId(eventId, 'eventId')
  return ravenFetch(`/events/${encodeURIComponent(eventId)}`)
}

async function fetchStandingsPage(roundId: string, page: number, pageSize: number) {
  assertValidId(roundId, 'roundId')
  return ravenFetch(
    `/tournament-rounds/${encodeURIComponent(roundId)}/standings/paginated/?page=${page}&page_size=${pageSize}`
  )
}

// Fetches every page of standings for a round and normalizes match_points to
// the current total (the standings snapshot field is stale mid-event).
export async function fetchAllStandings(roundId: string) {
  const all: any[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const data = await fetchStandingsPage(roundId, page, 50)
    all.push(...data.results)
    hasMore = data.next_page_number !== null
    page = data.next_page_number || page + 1
  }

  return all.map((entry) => ({
    ...entry,
    match_points: entry.user_event_status?.total_match_points ?? entry.match_points,
  }))
}

export function getTournamentStructure(eventDetails: any) {
  if (!eventDetails || !eventDetails.tournament_phases) return null

  const phases = eventDetails.tournament_phases
  const swissPhases = phases.filter((p: any) => p.round_type === 'SWISS')
  const eliminationPhase = phases.find((p: any) => p.round_type === 'RANKED_SINGLE_ELIMINATION')

  const totalSwissRounds = swissPhases.reduce((sum: number, p: any) => sum + (p.number_of_rounds || 0), 0)

  const topCutSize =
    eventDetails.top_cut_size || eliminationPhase?.rank_required_to_enter_phase || null

  let currentRoundId = null
  let currentRoundNumber = null
  let currentPhaseType = null
  let currentPhaseName = null
  let currentPhaseIndex = -1

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    if (!phase.rounds) continue

    const inProgressWithStandings = phase.rounds.find(
      (r: any) => r.status === 'IN_PROGRESS' && r.standings_status === 'GENERATED'
    )
    if (inProgressWithStandings) {
      currentRoundId = inProgressWithStandings.id
      currentRoundNumber = inProgressWithStandings.round_number
      currentPhaseType = phase.round_type
      currentPhaseName = phase.phase_name
      currentPhaseIndex = i
      break
    }

    const completedWithStandings = phase.rounds.filter(
      (r: any) => r.status === 'COMPLETE' && r.standings_status === 'GENERATED'
    )
    if (completedWithStandings.length > 0) {
      const last = completedWithStandings[completedWithStandings.length - 1]
      currentRoundId = last.id
      currentRoundNumber = last.round_number
      currentPhaseType = phase.round_type
      currentPhaseName = phase.phase_name
      currentPhaseIndex = i
    }
  }

  const isElimination = currentPhaseType === 'RANKED_SINGLE_ELIMINATION'
  const swissRoundsRemaining =
    currentPhaseType === 'SWISS' ? totalSwissRounds - (currentRoundNumber as number) : 0

  const nextPhase =
    currentPhaseIndex >= 0 && currentPhaseIndex + 1 < phases.length
      ? phases[currentPhaseIndex + 1]
      : null

  let advancementRequirement: any = null
  if (nextPhase && !isElimination) {
    if (nextPhase.rank_required_to_enter_phase) {
      advancementRequirement = {
        type: 'rank',
        value: nextPhase.rank_required_to_enter_phase,
        nextPhaseName: nextPhase.phase_name,
      }
    } else {
      const pointsMatch = nextPhase.phase_name.match(/(\d+)\s*point/i)
      if (pointsMatch) {
        advancementRequirement = {
          type: 'points',
          value: parseInt(pointsMatch[1], 10),
          nextPhaseName: nextPhase.phase_name,
        }
      }
    }
  }

  return {
    totalSwissRounds,
    topCutSize,
    currentRoundId,
    currentRoundNumber,
    currentPhaseType,
    currentPhaseName,
    isElimination,
    swissRoundsRemaining,
    advancementRequirement,
    tiebreakers: eventDetails.tiebreakers ?? [],
    eventName: eventDetails.name,
    startingPlayerCount: eventDetails.starting_player_count ?? null,
    timerEndDatetime: eventDetails.timer_end_datetime ?? null,
    timerIsRunning: eventDetails.timer_is_running ?? false,
    gameplayFormat: eventDetails.gameplay_format?.name ?? null,
    eventStore: eventDetails.store
      ? { name: eventDetails.store.name, address: eventDetails.full_address ?? null }
      : null,
    rulesEnforcementLevel: eventDetails.rules_enforcement_level ?? null,
  }
}

export function analyzeAdvancement(playerEntry: any, structure: any) {
  if (!playerEntry || !structure?.advancementRequirement) return null

  const { advancementRequirement, swissRoundsRemaining } = structure
  const { type, value, nextPhaseName } = advancementRequirement

  if (type === 'points') {
    const myPoints = playerEntry.match_points
    const maxPossible = myPoints + swissRoundsRemaining * 3
    if (myPoints >= value) {
      return { status: 'secured', nextPhaseName, value, type }
    }
    if (maxPossible < value) {
      return { status: 'eliminated', nextPhaseName, value, type }
    }
    const winsNeeded = Math.ceil((value - myPoints) / 3)
    return { status: 'possible', nextPhaseName, value, type, winsNeeded, pointsNeeded: value - myPoints }
  }

  if (type === 'rank') {
    const myRank = playerEntry.rank
    return {
      status: myRank <= value ? 'in_cut' : 'outside_cut',
      nextPhaseName,
      value,
      type,
    }
  }

  return null
}

export function analyzeId(playerEntry: any, allStandings: any[], structure: any) {
  if (!playerEntry || !allStandings || !structure?.topCutSize) return null

  const { topCutSize, swissRoundsRemaining } = structure
  const myPoints = playerEntry.match_points
  const myRank = playerEntry.rank

  const cutLinePlayer = allStandings.find((e) => e.rank === topCutSize) || null
  const cutLinePoints = cutLinePlayer?.match_points ?? null

  const pointsAboveCut = cutLinePoints !== null ? myPoints - cutLinePoints : null

  const afterIdPoints = myPoints + 1
  const afterWinPoints = myPoints + 3

  const playersWhoCouldPassMeOnWin = allStandings.filter(
    (e) => e.id !== playerEntry.id && e.match_points + 3 > afterIdPoints
  ).length

  let recommendation
  if (myRank > topCutSize) {
    recommendation = 'danger'
  } else if (pointsAboveCut !== null && pointsAboveCut >= 3) {
    recommendation = 'safe'
  } else if (pointsAboveCut !== null && pointsAboveCut >= 1) {
    recommendation = 'borderline'
  } else {
    recommendation = 'danger'
  }

  return {
    myRank,
    topCutSize,
    inCut: myRank <= topCutSize,
    cutLinePlayer,
    cutLinePoints,
    pointsAboveCut,
    afterIdPoints,
    afterWinPoints,
    swissRoundsRemaining,
    playersWhoCouldPassMeOnWin,
    recommendation,
  }
}

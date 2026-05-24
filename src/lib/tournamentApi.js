export async function fetchEventDetails(eventId) {
  try {
    const response = await fetch(`/api/event-details?eventId=${eventId}`)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || error.error || 'Failed to fetch event details')
    }

    return await response.json()
  } catch (err) {
    console.error('Event details fetch error:', err)
    throw err
  }
}

export function getTournamentStructure(eventDetails) {
  if (!eventDetails || !eventDetails.tournament_phases) return null

  const phases = eventDetails.tournament_phases
  const swissPhases = phases.filter((p) => p.round_type === 'SWISS')
  const eliminationPhase = phases.find((p) => p.round_type === 'RANKED_SINGLE_ELIMINATION')

  // Total swiss rounds across all swiss phases
  const totalSwissRounds = swissPhases.reduce((sum, p) => sum + (p.number_of_rounds || 0), 0)

  // Top cut size: prefer explicit field, fall back to rank_required on elimination phase
  const topCutSize =
    eventDetails.top_cut_size || eliminationPhase?.rank_required_to_enter_phase || null

  // Find the best round to show standings for:
  // Prefer IN_PROGRESS with standings generated, then fall back to last COMPLETE with standings generated
  let currentRoundId = null
  let currentRoundNumber = null
  let currentPhaseType = null
  let currentPhaseName = null
  let currentPhaseIndex = -1

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    if (!phase.rounds) continue

    // Check for in-progress round with generated standings
    const inProgressWithStandings = phase.rounds.find(
      (r) => r.status === 'IN_PROGRESS' && r.standings_status === 'GENERATED'
    )
    if (inProgressWithStandings) {
      currentRoundId = inProgressWithStandings.id
      currentRoundNumber = inProgressWithStandings.round_number
      currentPhaseType = phase.round_type
      currentPhaseName = phase.phase_name
      currentPhaseIndex = i
      break
    }

    // Track last completed round with generated standings as fallback
    const completedWithStandings = phase.rounds.filter(
      (r) => r.status === 'COMPLETE' && r.standings_status === 'GENERATED'
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
    currentPhaseType === 'SWISS' ? totalSwissRounds - currentRoundNumber : 0

  // Determine what's needed to advance to the next phase
  const nextPhase =
    currentPhaseIndex >= 0 && currentPhaseIndex + 1 < phases.length
      ? phases[currentPhaseIndex + 1]
      : null

  let advancementRequirement = null
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

// Keep backward compat
export function getCurrentRoundId(eventDetails) {
  return getTournamentStructure(eventDetails)?.currentRoundId ?? null
}

export async function fetchAllRegistrations(eventId) {
  const allResults = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const response = await fetch(
      `/api/tournament-registrations?eventId=${eventId}&page=${page}&pageSize=50`
    )
    if (!response.ok) break
    const data = await response.json()
    allResults.push(...data.results)
    hasMore = data.next_page_number !== null
    page = data.next_page_number || page + 1
  }

  return allResults
}

export async function fetchTournamentStandings(roundId, page = 1, pageSize = 10) {
  try {
    const response = await fetch(
      `/api/tournament-standings?roundId=${roundId}&page=${page}&pageSize=${pageSize}`
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || error.error || 'Failed to fetch standings')
    }

    return await response.json()
  } catch (err) {
    console.error('Tournament standings fetch error:', err)
    throw err
  }
}

const TIEBREAKER_LABELS = {
  opponent_match_win_percentage: 'Opp. Match Win %',
  game_win_percentage: 'Game Win %',
  opponent_game_win_percentage: 'Opp. Game Win %',
}

export function formatTiebreakers(entry, tiebreakerOrder = []) {
  const order =
    tiebreakerOrder.length > 0
      ? tiebreakerOrder
      : ['opponent_match_win_percentage', 'game_win_percentage', 'opponent_game_win_percentage']

  const values = {
    opponent_match_win_percentage: (entry.opponent_match_win_percentage * 100).toFixed(2),
    game_win_percentage: (entry.game_win_percentage * 100).toFixed(2),
    opponent_game_win_percentage: (entry.opponent_game_win_percentage * 100).toFixed(2),
  }

  return {
    rank: entry.rank,
    record: entry.record,
    matchPoints: entry.match_points,
    ordered: order.map((key) => ({ key, label: TIEBREAKER_LABELS[key] ?? key, value: values[key] })),
  }
}

export function analyzeAdvancement(playerEntry, structure) {
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

export function analyzeId(playerEntry, allStandings, structure) {
  if (!playerEntry || !allStandings || !structure?.topCutSize) return null

  const { topCutSize, swissRoundsRemaining } = structure
  const myPoints = playerEntry.match_points
  const myRank = playerEntry.rank

  // Player currently at the cut line
  const cutLinePlayer = allStandings.find((e) => e.rank === topCutSize) || null
  const cutLinePoints = cutLinePlayer?.match_points ?? null

  // Points buffer above cut line
  const pointsAboveCut = cutLinePoints !== null ? myPoints - cutLinePoints : null

  // After ID: I gain 1 point. Worst case, cut-line player wins (+3 pts).
  // Still safe if my new points (myPoints+1) > cutLinePoints+3, i.e. buffer > 2
  const afterIdPoints = myPoints + 1
  const afterWinPoints = myPoints + 3

  // Count players who would be strictly above me after I ID (assuming they all win = worst case)
  const playersWhoCouldPassMeOnWin = allStandings.filter(
    (e) => e.id !== playerEntry.id && e.match_points + 3 > afterIdPoints
  ).length

  let recommendation
  if (myRank > topCutSize) {
    recommendation = 'danger'
  } else if (pointsAboveCut >= 3) {
    recommendation = 'safe'
  } else if (pointsAboveCut >= 1) {
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

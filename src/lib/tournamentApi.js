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

  // Find current round across all phases
  let currentRoundId = null
  let currentRoundNumber = null
  let currentPhaseType = null

  for (const phase of phases) {
    if (!phase.rounds) continue
    const inProgress = phase.rounds.find((r) => r.status === 'IN_PROGRESS')
    if (inProgress) {
      currentRoundId = inProgress.id
      currentRoundNumber = inProgress.round_number
      currentPhaseType = phase.round_type
      break
    }
    // Track last completed round as fallback
    const completed = phase.rounds.filter((r) => r.status === 'COMPLETE')
    if (completed.length > 0) {
      const last = completed[completed.length - 1]
      currentRoundId = last.id
      currentRoundNumber = last.round_number
      currentPhaseType = phase.round_type
    }
  }

  const swissRoundsRemaining =
    currentPhaseType === 'SWISS' ? totalSwissRounds - currentRoundNumber : 0

  return {
    totalSwissRounds,
    topCutSize,
    currentRoundId,
    currentRoundNumber,
    currentPhaseType,
    swissRoundsRemaining,
    eventName: eventDetails.name,
  }
}

// Keep backward compat
export function getCurrentRoundId(eventDetails) {
  return getTournamentStructure(eventDetails)?.currentRoundId ?? null
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

export function formatTiebreakers(entry) {
  return {
    rank: entry.rank,
    record: entry.record,
    matchPoints: entry.match_points,
    gameWinPercentage: (entry.game_win_percentage * 100).toFixed(2),
    opponentMatchWinPercentage: (entry.opponent_match_win_percentage * 100).toFixed(2),
    opponentGameWinPercentage: (entry.opponent_game_win_percentage * 100).toFixed(2),
  }
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

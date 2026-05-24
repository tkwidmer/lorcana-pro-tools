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

export function getCurrentRoundId(eventDetails) {
  if (!eventDetails || !eventDetails.tournament_phases) return null

  for (const phase of eventDetails.tournament_phases) {
    if (!phase.rounds) continue

    // Find in-progress round first
    const inProgressRound = phase.rounds.find((r) => r.status === 'IN_PROGRESS')
    if (inProgressRound) return inProgressRound.id

    // Fall back to last completed round
    const completedRounds = phase.rounds.filter((r) => r.status === 'COMPLETE')
    if (completedRounds.length > 0) {
      return completedRounds[completedRounds.length - 1].id
    }
  }

  return null
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

export function findPlayerInStandings(standings, playerName) {
  if (!standings || !playerName) return null
  const searchTerm = playerName.toLowerCase()
  return standings.find(
    (entry) =>
      entry.player.best_identifier.toLowerCase().includes(searchTerm) ||
      entry.user_event_status.best_identifier.toLowerCase().includes(searchTerm)
  )
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

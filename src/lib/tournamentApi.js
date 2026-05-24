export async function fetchTournamentRound(eventId) {
  try {
    const response = await fetch(
      `/api/tournament-round?eventId=${eventId}`
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || error.error || 'Failed to fetch tournament round')
    }

    const data = await response.json()
    return data.roundId
  } catch (err) {
    console.error('Tournament round fetch error:', err)
    throw err
  }
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

export async function fetchAllTournamentStandings(roundId, pageSize = 10) {
  const allResults = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const data = await fetchTournamentStandings(roundId, page, pageSize)
    allResults.push(...data.results)
    hasMore = data.next_page_number !== null
    page = data.next_page_number || page + 1
  }

  return allResults
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

export function calculateTiebreakers(entry) {
  return {
    matchPoints: entry.match_points,
    opponentMatchWinPercentage: (entry.opponent_match_win_percentage * 100).toFixed(2),
    gameWinPercentage: (entry.game_win_percentage * 100).toFixed(2),
    opponentGameWinPercentage: (entry.opponent_game_win_percentage * 100).toFixed(2),
  }
}

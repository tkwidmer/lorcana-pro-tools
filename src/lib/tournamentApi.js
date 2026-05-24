export async function fetchEventRegistrations(eventId, page = 1, pageSize = 10) {
  try {
    const response = await fetch(
      `/api/tournament-registrations?eventId=${eventId}&page=${page}&pageSize=${pageSize}`
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || error.error || 'Failed to fetch event registrations')
    }

    return await response.json()
  } catch (err) {
    console.error('Event registrations fetch error:', err)
    throw err
  }
}

export async function fetchAllEventRegistrations(eventId, pageSize = 50) {
  const allResults = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const data = await fetchEventRegistrations(eventId, page, pageSize)
    allResults.push(...data.results)
    hasMore = data.next_page_number !== null
    page = data.next_page_number || page + 1
  }

  return allResults
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

export function findPlayerInRegistrations(registrations, playerName) {
  if (!registrations || !playerName) return null
  const searchTerm = playerName.toLowerCase()
  return registrations.find(
    (entry) =>
      entry.user.best_identifier.toLowerCase().includes(searchTerm) ||
      entry.best_identifier.toLowerCase().includes(searchTerm)
  )
}

export function formatRecord(registration) {
  return `${registration.matches_won}-${registration.matches_drawn}-${registration.matches_lost}`
}

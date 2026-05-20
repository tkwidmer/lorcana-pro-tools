export async function fetchLeaderboard({ queue } = {}) {
  const params = new URLSearchParams()
  if (queue) params.set('queue', queue)
  const qs = params.toString()
  const res = await fetch(`/api/duels-leaderboard${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`Leaderboard request failed: ${res.status}`)
  return res.json()
}

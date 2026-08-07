export async function fetchLeaderboard({ queue } = {}) {
  const params = new URLSearchParams({ endpoint: 'leaderboard' })
  if (queue) params.set('queue', queue)
  const res = await fetch(`/api/duels?${params}`)
  if (!res.ok) throw new Error(`Leaderboard request failed: ${res.status}`)
  return res.json()
}

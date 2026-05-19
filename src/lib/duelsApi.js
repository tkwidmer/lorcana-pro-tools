const TOKEN_KEY = 'duels_api_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token.trim())
  else localStorage.removeItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function fetchMatchHistory({ cursor, limit = 100, from, to, source } = {}) {
  const token = getToken()
  if (!token) throw new Error('No API token configured')

  const params = new URLSearchParams({ format: 'json', limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (source) params.set('source', source)

  const res = await fetch(`/api/duels-match-history?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`API error ${res.status}`)

  return res.json() // { games: MatchHistoryRow[], next_cursor: string | null }
}

export async function fetchGamelogBuffer(gameId) {
  const token = getToken()
  if (!token) throw new Error('No API token configured')

  const res = await fetch(`/api/duels-gamelog?id=${encodeURIComponent(gameId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`Failed to fetch gamelog: ${res.status}`)

  return res.arrayBuffer()
}

export async function fetchReplayBuffer(replayId) {
  const token = getToken()
  if (!token) throw new Error('No API token configured')

  const res = await fetch(`/api/duels-replay?id=${encodeURIComponent(replayId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`Failed to fetch replay: ${res.status}`)

  return res.arrayBuffer()
}

export async function fetchStats({ queue, period }) {
  if (!queue) throw new Error('Queue is required')
  if (!period) throw new Error('Period is required')

  const res = await fetch(`/api/duels-stats?queue=${encodeURIComponent(queue)}&period=${encodeURIComponent(period)}`)

  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`)

  return res.json()
}

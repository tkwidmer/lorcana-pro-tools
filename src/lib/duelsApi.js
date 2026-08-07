const OLD_TOKEN_KEY = 'duels_api_token'
const TOKENS_KEY = 'duels_api_tokens'
const ACTIVE_ID_KEY = 'duels_api_active_token_id'

function getRawTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '[]')
  } catch {
    return []
  }
}

// Migrate single-token storage to multi-token on first access
function migrate() {
  const old = localStorage.getItem(OLD_TOKEN_KEY)
  if (!old) return
  if (getRawTokens().length === 0) {
    const id = String(Date.now())
    localStorage.setItem(TOKENS_KEY, JSON.stringify([{ id, label: 'My Account', token: old.trim() }]))
    localStorage.setItem(ACTIVE_ID_KEY, id)
  }
  localStorage.removeItem(OLD_TOKEN_KEY)
}

export function getTokens() {
  migrate()
  return getRawTokens()
}

export function getActiveTokenId() {
  return localStorage.getItem(ACTIVE_ID_KEY) ?? null
}

export function getToken() {
  const tokens = getTokens()
  if (tokens.length === 0) return ''
  const activeId = getActiveTokenId()
  const active = tokens.find(t => t.id === activeId) ?? tokens[0]
  return active?.token ?? ''
}

export function addToken(label, token) {
  migrate()
  const tokens = getRawTokens()
  const id = String(Date.now())
  tokens.push({ id, label: label.trim() || 'Account', token: token.trim() })
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
  // Auto-activate if this is the first token
  if (tokens.length === 1) localStorage.setItem(ACTIVE_ID_KEY, id)
  return id
}

export function removeToken(id) {
  const tokens = getRawTokens().filter(t => t.id !== id)
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
  if (getActiveTokenId() === id) {
    if (tokens.length > 0) localStorage.setItem(ACTIVE_ID_KEY, tokens[0].id)
    else localStorage.removeItem(ACTIVE_ID_KEY)
  }
}

export function setActiveToken(id) {
  localStorage.setItem(ACTIVE_ID_KEY, id)
}

export function updateTokenLabel(id, label) {
  const tokens = getRawTokens().map(t =>
    t.id === id ? { ...t, label: label.trim() || 'Account' } : t
  )
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

export function updateTokenUsername(id, username) {
  const tokens = getRawTokens().map(t =>
    t.id === id ? { ...t, username: username.trim() } : t
  )
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

export function setTokenUserId(id, userId) {
  const tokens = getRawTokens()
  const token = tokens.find(t => t.id === id)
  if (!token || token.userId === userId) return
  const updated = tokens.map(t => t.id === id ? { ...t, userId } : t)
  localStorage.setItem(TOKENS_KEY, JSON.stringify(updated))
}

export async function testToken(token) {
  const params = new URLSearchParams({ format: 'json', limit: '1' })
  const res = await fetch(`/api/duels-match-history?${params}`, {
    headers: { Authorization: `Bearer ${token.trim()}` },
  })
  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
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

// Fetch a manifest of signed CDN URLs for multiple gamelog IDs in one request.
// Returns { files: [{id, filename, url}], missing: string[] }
export async function fetchGamelogManifest(ids) {
  const token = getToken()
  if (!token) throw new Error('No API token configured')

  const res = await fetch('/api/duels-gamelog-bulk', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids }),
  })

  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`Failed to fetch gamelog manifest: ${res.status}`)

  return res.json()
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

export async function fetchDeck(id) {
  const token = getToken()
  if (!token) throw new Error('No API token configured')

  const res = await fetch(`/api/duels-deck?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (res.status === 404) { const e = new Error('Deck not found'); e.status = 404; throw e }
  if (!res.ok) throw new Error(`API error ${res.status}`)

  return res.json() // { deck: DeckDetail }
}

export async function fetchDecks() {
  const token = getToken()
  if (!token) throw new Error('No API token configured')

  const res = await fetch('/api/duels-deck', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`API error ${res.status}`)

  return res.json() // { decks: Deck[] }
}

export async function fetchPersonalStats({ deckId, source }) {
  if (!deckId) throw new Error('deckId is required')
  const token = getToken()
  if (!token) throw new Error('No API token configured')

  const params = new URLSearchParams({ deckId })
  if (source) params.set('source', source)

  const res = await fetch(`/api/duels-personal-stats?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`API error ${res.status}`)

  return res.json() // { activity, colorPairs, matchups, deckVersions, filters }
}

export async function fetchStats({ queue, period, ranks }) {
  if (!queue) throw new Error('Queue is required')
  if (!period) throw new Error('Period is required')

  const params = new URLSearchParams({ queue, period })
  if (ranks && ranks.length > 0) {
    params.set('ranks', ranks.join(','))
  }

  const res = await fetch(`/api/duels-stats?${params}`)

  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`)

  return res.json()
}

import { supabase } from './supabaseClient'

// duels.ink API tokens are stored server-side in Supabase (api/duels-tokens.ts
// + supabase/migrations/004_duels_api_tokens.sql, 005_duels_api_tokens_crypto_functions.sql),
// encrypted at rest. Every duels.ink-dependent feature already requires being
// logged in (SupporterRoute), so this module keeps an in-memory cache backed
// by that API rather than localStorage — initTokenSync(userId) must be called
// (from AuthProvider) whenever the auth user changes, and one-time migrates
// any pre-existing localStorage tokens up on first sync, then clears them.

const LEGACY_OLD_TOKEN_KEY = 'duels_api_token'
const LEGACY_TOKENS_KEY = 'duels_api_tokens'
const LEGACY_ACTIVE_ID_KEY = 'duels_api_active_token_id'

let cachedTokens = [] // [{ id, label, token, username, userId, isActive }]
let currentUserId = null
let readyPromise = Promise.resolve()

function readLegacyLocalTokens() {
  try {
    const old = localStorage.getItem(LEGACY_OLD_TOKEN_KEY)
    let tokens = JSON.parse(localStorage.getItem(LEGACY_TOKENS_KEY) ?? '[]')
    if (old && tokens.length === 0) {
      tokens = [{ id: String(Date.now()), label: 'My Account', token: old.trim() }]
    }
    const activeId = localStorage.getItem(LEGACY_ACTIVE_ID_KEY) ?? null
    return { tokens, activeId }
  } catch {
    return { tokens: [], activeId: null }
  }
}

function clearLegacyLocalTokens() {
  localStorage.removeItem(LEGACY_OLD_TOKEN_KEY)
  localStorage.removeItem(LEGACY_TOKENS_KEY)
  localStorage.removeItem(LEGACY_ACTIVE_ID_KEY)
}

function normalizeRemote(rows) {
  return (rows ?? []).map(r => ({
    id: r.id,
    label: r.label ?? 'Account',
    token: r.token,
    username: r.username ?? '',
    userId: r.duels_user_id ?? undefined,
    isActive: r.is_active,
  }))
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) throw new Error('Not signed in')
  return { Authorization: `Bearer ${accessToken}` }
}

async function apiFetch(query, opts = {}) {
  const headers = { ...(await authHeaders()), ...(opts.headers ?? {}) }
  const res = await fetch(`/api/duels-tokens${query}`, { ...opts, headers })
  if (!res.ok) throw new Error(`Token sync failed (${res.status})`)
  return res.json()
}

async function migrateLegacyTokens() {
  const { tokens: legacy, activeId } = readLegacyLocalTokens()
  if (legacy.length === 0) {
    clearLegacyLocalTokens()
    return
  }
  for (const t of legacy) {
    await apiFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, label: t.label, token: t.token, username: t.username, duelsUserId: t.userId }),
    })
  }
  if (activeId && legacy.some(t => t.id === activeId)) {
    await apiFetch(`?id=${encodeURIComponent(activeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    })
  }
  clearLegacyLocalTokens()
}

// Call whenever the authenticated user changes (from AuthProvider). Loads
// this user's tokens from Supabase into the in-memory cache, migrating any
// pre-existing localStorage tokens up (once) if the account has none yet.
export function initTokenSync(userId) {
  currentUserId = userId

  readyPromise = (async () => {
    if (!userId) {
      cachedTokens = []
      return
    }
    try {
      let { tokens: remote } = await apiFetch('', { method: 'GET' })
      if (!remote || remote.length === 0) {
        await migrateLegacyTokens()
        ;({ tokens: remote } = await apiFetch('', { method: 'GET' }))
      } else {
        clearLegacyLocalTokens()
      }
      cachedTokens = normalizeRemote(remote)
    } catch (err) {
      console.error('Failed to load duels.ink tokens:', err)
      cachedTokens = []
    }
  })()

  return readyPromise
}

// Resolves once the current initTokenSync() call has finished loading.
export function waitForTokenSync() {
  return readyPromise
}

export function getTokens() {
  return cachedTokens
}

export function getActiveTokenId() {
  return cachedTokens.find(t => t.isActive)?.id ?? null
}

export function getToken() {
  if (cachedTokens.length === 0) return ''
  const active = cachedTokens.find(t => t.isActive) ?? cachedTokens[0]
  return active?.token ?? ''
}

export async function addToken(label, token) {
  if (!currentUserId) throw new Error('Not signed in')
  const id = String(Date.now())
  const trimmedLabel = label.trim() || 'Account'
  const trimmedToken = token.trim()
  const isFirst = cachedTokens.length === 0
  const prev = cachedTokens
  cachedTokens = [...prev, { id, label: trimmedLabel, token: trimmedToken, username: '', isActive: isFirst }]
  try {
    await apiFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, label: trimmedLabel, token: trimmedToken }),
    })
  } catch (err) {
    cachedTokens = prev
    throw err
  }
  return id
}

export async function removeToken(id) {
  const prev = cachedTokens
  const wasActive = prev.find(t => t.id === id)?.isActive
  let next = prev.filter(t => t.id !== id)
  if (wasActive && next.length > 0) next = next.map((t, i) => ({ ...t, isActive: i === 0 }))
  cachedTokens = next
  try {
    await apiFetch(`?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch (err) {
    cachedTokens = prev
    throw err
  }
}

export async function setActiveToken(id) {
  const prev = cachedTokens
  cachedTokens = prev.map(t => ({ ...t, isActive: t.id === id }))
  try {
    await apiFetch(`?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    })
  } catch (err) {
    cachedTokens = prev
    throw err
  }
}

export async function updateTokenLabel(id, label) {
  const prev = cachedTokens
  const trimmed = label.trim() || 'Account'
  cachedTokens = prev.map(t => (t.id === id ? { ...t, label: trimmed } : t))
  try {
    await apiFetch(`?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: trimmed }),
    })
  } catch (err) {
    cachedTokens = prev
    throw err
  }
}

export async function updateTokenUsername(id, username) {
  const prev = cachedTokens
  const trimmed = username.trim()
  cachedTokens = prev.map(t => (t.id === id ? { ...t, username: trimmed } : t))
  try {
    await apiFetch(`?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: trimmed }),
    })
  } catch (err) {
    cachedTokens = prev
    throw err
  }
}

export async function setTokenUserId(id, userId) {
  const prev = cachedTokens
  const token = prev.find(t => t.id === id)
  if (!token || token.userId === userId) return
  cachedTokens = prev.map(t => (t.id === id ? { ...t, userId } : t))
  try {
    await apiFetch(`?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duelsUserId: userId }),
    })
  } catch {
    cachedTokens = prev
    // Best-effort — losing an attempted userId attribution isn't worth surfacing an error.
  }
}

export async function testToken(token) {
  const params = new URLSearchParams({ endpoint: 'match-history', format: 'json', limit: '1' })
  const res = await fetch(`/api/duels?${params}`, {
    headers: { Authorization: `Bearer ${token.trim()}` },
  })
  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function fetchMatchHistory({ cursor, limit = 100, from, to, source } = {}) {
  const token = getToken()
  if (!token) throw new Error('No API token configured')

  const params = new URLSearchParams({ endpoint: 'match-history', format: 'json', limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (source) params.set('source', source)

  const res = await fetch(`/api/duels?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`API error ${res.status}`)

  return res.json() // { games: MatchHistoryRow[], next_cursor: string | null }
}

export async function fetchGamelogBuffer(gameId) {
  const token = getToken()
  if (!token) throw new Error('No API token configured')

  const res = await fetch(`/api/duels?endpoint=gamelog&id=${encodeURIComponent(gameId)}`, {
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

  const res = await fetch('/api/duels?endpoint=gamelog-bulk', {
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

  const res = await fetch(`/api/duels?endpoint=replay&id=${encodeURIComponent(replayId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`Failed to fetch replay: ${res.status}`)

  return res.arrayBuffer()
}

export async function fetchDeck(id) {
  const token = getToken()
  if (!token) throw new Error('No API token configured')

  const res = await fetch(`/api/duels?endpoint=deck&id=${encodeURIComponent(id)}`, {
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

  const res = await fetch('/api/duels?endpoint=deck', {
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

  const params = new URLSearchParams({ endpoint: 'deck', id: deckId, personalStats: '1' })
  if (source) params.set('source', source)

  const res = await fetch(`/api/duels?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new Error('Invalid or expired API token')
  if (!res.ok) throw new Error(`API error ${res.status}`)

  return res.json() // { activity, colorPairs, matchups, deckVersions, filters }
}

export async function fetchStats({ queue, period, ranks }) {
  if (!queue) throw new Error('Queue is required')
  if (!period) throw new Error('Period is required')

  const params = new URLSearchParams({ endpoint: 'stats', queue, period })
  if (ranks && ranks.length > 0) {
    params.set('ranks', ranks.join(','))
  }

  const res = await fetch(`/api/duels?${params}`)

  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`)

  return res.json()
}

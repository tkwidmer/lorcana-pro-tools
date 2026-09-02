import { supabase } from './supabaseClient'

// Client for the caster-history archive of admin-imported RPH major events
// (api/tournament-history.ts + supabase/migrations/008_tournament_history.sql).
// Every call attaches the caller's Supabase session JWT — the server verifies
// it (see api/_lib/requireAdmin.js) rather than trusting a client-supplied id.

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) throw new Error('Not signed in')
  return { Authorization: `Bearer ${accessToken}` }
}

async function apiFetch(query, opts = {}) {
  const headers = { ...(await authHeaders()), ...(opts.headers ?? {}) }
  const res = await fetch(`/api/tournament-history${query}`, { ...opts, headers })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || `Request failed (${res.status})`)
  }
  return res.json()
}

export async function fetchPlayerTournamentHistory(playerId) {
  return apiFetch(`?endpoint=player-history&playerId=${encodeURIComponent(playerId)}`)
}

export async function fetchHeadToHead(playerAId, playerBId) {
  return apiFetch(
    `?endpoint=head-to-head&playerA=${encodeURIComponent(playerAId)}&playerB=${encodeURIComponent(playerBId)}`
  )
}

export async function searchTournamentPlayers(query) {
  return apiFetch(`?endpoint=search-players&q=${encodeURIComponent(query)}`)
}

export async function fetchRecentTournamentImports() {
  return apiFetch('?endpoint=recent-imports')
}

export async function fetchSuggestedTournamentImports() {
  return apiFetch('?endpoint=suggested-imports')
}

export async function importTournamentEvent(eventUrl) {
  return apiFetch('?endpoint=import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventUrl }),
  })
}

// Matches the server's generated `player_pair` column format (LEAST:GREATEST)
// so client-computed pair keys always agree with the DB's — see
// supabase/migrations/008_tournament_history.sql.
export function pairKeyOf(idA, idB) {
  return [String(idA), String(idB)].sort().join(':')
}

// Batched "Notable Pairing Badges" lookup — sparse response, a missing key
// means false. Used by usePairingBadges.js.
export async function fetchPairingBadges(playerIds, pairKeys) {
  const params = new URLSearchParams({ endpoint: 'pairing-badges' })
  if (playerIds.length > 0) params.set('playerIds', playerIds.join(','))
  if (pairKeys.length > 0) params.set('pairKeys', pairKeys.join(','))
  return apiFetch(`?${params.toString()}`)
}

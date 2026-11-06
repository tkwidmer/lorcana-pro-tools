import { supabase } from './supabaseClient'

// Client for the caster-history archive of admin-imported RPH major events
// (api/tournament-history.ts + supabase/migrations/008_tournament_history.sql).
// The archive reads are public (publicFetch); only the import/admin and
// pairing-badge calls attach the caller's Supabase session JWT, which the
// server verifies (see api/_lib/requireAdmin.ts) rather than trusting a
// client-supplied id.

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) throw new Error('Not signed in')
  return { Authorization: `Bearer ${accessToken}` }
}

// Throws an Error carrying `.status`, so pages can tell a 404 ("not found")
// from a failed request.
async function readJson(res) {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    const err = new Error(error.error || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return res.json()
}

async function apiFetch(query, opts = {}) {
  const headers = { ...(await authHeaders()), ...(opts.headers ?? {}) }
  return readJson(await fetch(`/api/tournament-history${query}`, { ...opts, headers }))
}

// Public, edge-cached reads (see api/tournament-history.ts). No session
// header on purpose: none is required, and an Authorization header on the
// request would also bypass the edge cache that stands in for auth here.
async function publicFetch(query) {
  return readJson(await fetch(`/api/tournament-history${query}`))
}

export async function fetchArchiveEvents() {
  return publicFetch('?endpoint=events')
}

export async function fetchArchiveEvent(eventId) {
  return publicFetch(`?endpoint=event&eventId=${encodeURIComponent(eventId)}`)
}

export async function fetchArchiveEventPlayer(eventId, playerId) {
  return publicFetch(
    `?endpoint=event-player&eventId=${encodeURIComponent(eventId)}&playerId=${encodeURIComponent(playerId)}`
  )
}

export async function fetchArchivePlayer(playerId) {
  return publicFetch(`?endpoint=player&playerId=${encodeURIComponent(playerId)}`)
}

export async function fetchPlayerTournamentHistory(playerId) {
  return publicFetch(`?endpoint=player-history&playerId=${encodeURIComponent(playerId)}`)
}

export async function fetchRatings() {
  return publicFetch('?endpoint=ratings')
}

export async function recomputeRatings() {
  return apiFetch('?endpoint=recompute-ratings', { method: 'POST' })
}

export async function fetchHeadToHead(playerAId, playerBId) {
  return publicFetch(
    `?endpoint=head-to-head&playerA=${encodeURIComponent(playerAId)}&playerB=${encodeURIComponent(playerBId)}`
  )
}

export async function searchTournamentPlayers(query) {
  return publicFetch(`?endpoint=search-players&q=${encodeURIComponent(query)}`)
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

// Admin: set an archived event's ink pairs from an inkdecks.com decklist
// export (the parsed JSON array). Resolves to { updates, unmatched,
// ambiguous, invalid }.
export async function uploadEventInkPairs(eventId, decks) {
  return apiFetch('?endpoint=ink-pairs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, decks }),
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
export async function fetchPairingBadges(playerIds, pairKeys, excludeEventId) {
  const params = new URLSearchParams({ endpoint: 'pairing-badges' })
  if (playerIds.length > 0) params.set('playerIds', playerIds.join(','))
  if (pairKeys.length > 0) params.set('pairKeys', pairKeys.join(','))
  if (excludeEventId) params.set('excludeEventId', excludeEventId)
  return apiFetch(`?${params.toString()}`)
}

// Team Tracker (docs/agents/tournaments.md "Teams"). The directory, a team
// and the live majors are public reads; the rest carry the session.
export async function fetchTeams() {
  return publicFetch('?endpoint=teams')
}

export async function fetchTeam(slug) {
  return publicFetch(`?endpoint=team&slug=${encodeURIComponent(slug)}`)
}

export async function fetchLiveMajors() {
  return publicFetch('?endpoint=live-majors')
}

// { admin, teams: [{ id, slug, name }] } for the signed-in user.
export async function fetchMyTeams() {
  return apiFetch('?endpoint=my-teams')
}

export async function fetchAdminTeams() {
  return apiFetch('?endpoint=admin-teams')
}

export async function searchProfiles(query) {
  return apiFetch(`?endpoint=admin-profile-search&q=${encodeURIComponent(query)}`)
}

function postJson(endpoint, body) {
  return apiFetch(`?endpoint=${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// { id?, slug?, name, url, logoUrl, managerUserId? } → { team }. Without an
// id it creates (admin only); slug and managerUserId are admin-only fields.
export async function saveTeam(body) {
  return postJson('team-save', body)
}

// { id?, teamId, playerId, playerName, joinedOn, leftOn } → { member }
export async function saveTeamMember(body) {
  return postJson('team-member-save', body)
}

export async function deleteTeamMember(id) {
  return postJson('team-member-delete', { id })
}

export async function dissolveTeam(id) {
  return postJson('team-dissolve', { id })
}

export async function reinstateTeam(id) {
  return postJson('team-reinstate', { id })
}

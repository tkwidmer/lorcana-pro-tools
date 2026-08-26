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

export async function importTournamentEvent(eventUrl) {
  return apiFetch('?endpoint=import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventUrl }),
  })
}

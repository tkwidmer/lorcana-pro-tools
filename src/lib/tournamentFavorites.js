import { supabase } from './supabaseClient'

// Tournament Lookup favorites: `{ [rphPlayerId]: { name } }`. Signed in, they
// live in `tournament_favorites` (migration 034); signed out, in localStorage.
// The first signed-in load uploads any local favorites and clears the key, so
// a browser's pre-sign-in stars join the account. Every call throws on error.

const LOCAL_KEY = 'lorcana_tournament_favorites'

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') } catch { return {} }
}

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

export async function loadFavorites(userId) {
  if (!userId) return readLocal()
  const local = Object.entries(readLocal())
  if (local.length > 0) {
    const rows = local.map(([playerId, fav]) => ({ user_id: userId, player_id: playerId, name: fav.name }))
    unwrap(await supabase.from('tournament_favorites').upsert(rows, { onConflict: 'user_id,player_id', ignoreDuplicates: true }))
    localStorage.removeItem(LOCAL_KEY)
  }
  const rows = unwrap(await supabase.from('tournament_favorites').select('player_id, name'))
  return Object.fromEntries(rows.map((r) => [r.player_id, { name: r.name }]))
}

export async function toggleFavorite(userId, favorites, playerId, name) {
  const key = String(playerId)
  const next = { ...favorites }
  if (next[key]) delete next[key]
  else next[key] = { name }

  if (!userId) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
  } else if (favorites[key]) {
    unwrap(await supabase.from('tournament_favorites').delete().eq('user_id', userId).eq('player_id', key))
  } else {
    unwrap(await supabase.from('tournament_favorites').insert({ user_id: userId, player_id: key, name }))
  }
  return next
}

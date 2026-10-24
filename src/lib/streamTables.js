import { supabase, getCurrentUser } from './supabaseClient'

// Data access for Stream Overlay tables (`stream_tables`, see
// supabase/migrations/012_stream_tables.sql). Owner reads/writes go straight
// to the table under RLS; the unauthenticated OBS view and players'
// controller use the two SECURITY DEFINER functions and the public broadcast
// topic the row's trigger publishes on. Every call throws on error.

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

export async function listMyTables() {
  return unwrap(await supabase.from('stream_tables').select('*').order('created_at'))
}

export async function createTable(name) {
  const user = await getCurrentUser()
  return unwrap(await supabase.from('stream_tables').insert({ owner_id: user.id, name }).select().single())
}

export async function updateTable(id, patch) {
  return unwrap(await supabase.from('stream_tables').update(patch).eq('id', id).select().single())
}

// The linked clock, written only while the row is still linked to the event
// it was polled from: a second panel left on an earlier event's link must
// not write that event's clock over this one's.
export async function updateLinkedClock(id, rphEventId, patch) {
  unwrap(await supabase.from('stream_tables').update(patch).eq('id', id).eq('rph_event_id', rphEventId))
}

export async function deleteTable(id) {
  unwrap(await supabase.from('stream_tables').delete().eq('id', id))
}

export async function fetchPublicTable(id) {
  const row = unwrap(await supabase.rpc('get_stream_table', { p_id: id }))
  if (!row) throw new Error('Unknown stream table')
  return row
}

// One tap: an atomic ±1 on `lore` or `game_wins` for side 1 or 2, gated by
// the controller key that rides in the controller link.
export async function adjustTable(id, key, side, field, delta) {
  unwrap(await supabase.rpc('adjust_stream_table', { p_id: id, p_key: key, p_side: side, p_field: field, p_delta: delta }))
}

// "Next game": both players' lore to zero in one call, gated by the
// controller key like a tap (migration 019).
export async function resetLore(id, key) {
  unwrap(await supabase.rpc('reset_stream_table_lore', { p_id: id, p_key: key }))
}

// Live updates: the row's trigger broadcasts its public shape on every
// change. Returns an unsubscribe function.
export function subscribeToTable(id, onRow) {
  const channel = supabase.channel(`stream-table:${id}`)
  channel.on('broadcast', { event: 'state' }, ({ payload }) => onRow(payload)).subscribe()
  return () => { supabase.removeChannel(channel) }
}

// Which of the owner's tables the panel shows; also set by the Tournament
// Lookup hand-off so the panel opens on the table that was just sent to.
const SELECTED_KEY = 'lorcana_stream_table'

export function readSelectedTableId() {
  try { return localStorage.getItem(SELECTED_KEY) } catch { return null }
}

export function storeSelectedTableId(id) {
  try { localStorage.setItem(SELECTED_KEY, id) } catch { /* noop */ }
}

// Upload a logo to the public `stream-logos` bucket (migration 016) under the
// owner's own folder and return its public URL, ready for a logo column.
export async function uploadLogo(file) {
  const user = await getCurrentUser()
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
  unwrap(await supabase.storage.from('stream-logos').upload(path, file, { contentType: file.type }))
  return supabase.storage.from('stream-logos').getPublicUrl(path).data.publicUrl
}

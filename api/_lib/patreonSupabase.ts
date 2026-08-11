// Server-side Supabase access for the Patreon supporter integration. Reuses
// the same service-role client as the Discord bot (getSupabaseServiceClient)
// since both need to bypass RLS for tables that have zero client-facing
// policies. See supabase/migrations/006_patreon_links.sql and
// 007_patreon_links_crypto_functions.sql.
import { getSupabaseServiceClient } from './discordSupabase.js'

export interface PatreonLinkRow {
  id: string
  user_id: string
  patreon_user_id: string
  patron_status: string | null
  last_charge_status: string | null
  token_expires_at: string | null
  last_synced_at: string | null
  updated_at: string
}

export interface PatreonTokens {
  accessToken: string
  refreshToken: string
  expiresAt: string | null
}

function getEncryptionKey(): string {
  const key = process.env.PATREON_TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('Missing PATREON_TOKEN_ENCRYPTION_KEY')
  return key
}

// A patron in good standing — the only status that should grant supporter
// access. Declined/former/null patrons (or a member record that never
// reached an active charge) should not have access.
export function isActivePatron(memberAttrs: {
  patron_status?: string | null
  last_charge_status?: string | null
}): boolean {
  return memberAttrs.patron_status === 'active_patron'
}

export async function upsertPatreonLink(params: {
  userId: string
  patreonUserId: string
  patronStatus: string | null
  lastChargeStatus: string | null
  tokens?: PatreonTokens
}): Promise<void> {
  const supabase = getSupabaseServiceClient()

  const row: Record<string, unknown> = {
    user_id: params.userId,
    patreon_user_id: params.patreonUserId,
    patron_status: params.patronStatus,
    last_charge_status: params.lastChargeStatus,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (params.tokens) {
    const [{ data: accessCipher, error: accessError }, { data: refreshCipher, error: refreshError }] =
      await Promise.all([
        supabase.rpc('encrypt_patreon_token', { p_plain: params.tokens.accessToken, p_key: getEncryptionKey() }),
        supabase.rpc('encrypt_patreon_token', { p_plain: params.tokens.refreshToken, p_key: getEncryptionKey() }),
      ])
    if (accessError) throw accessError
    if (refreshError) throw refreshError
    row.access_token_encrypted = accessCipher
    row.refresh_token_encrypted = refreshCipher
    row.token_expires_at = params.tokens.expiresAt
  }

  const { error } = await supabase.from('patreon_links').upsert(row, { onConflict: 'user_id' })
  if (error) throw new Error(`Failed to save Patreon link: ${error.message}`)
}

export async function findLinkByUserId(userId: string): Promise<PatreonLinkRow | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.from('patreon_links').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`Failed to look up Patreon link: ${error.message}`)
  return data
}

export async function findLinkByPatreonUserId(patreonUserId: string): Promise<PatreonLinkRow | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('patreon_links')
    .select('*')
    .eq('patreon_user_id', patreonUserId)
    .maybeSingle()
  if (error) throw new Error(`Failed to look up Patreon link: ${error.message}`)
  return data
}

export async function listStaleLinks(olderThan: Date): Promise<PatreonLinkRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('patreon_links')
    .select('*')
    .or(`last_synced_at.is.null,last_synced_at.lt.${olderThan.toISOString()}`)
  if (error) throw new Error(`Failed to list stale Patreon links: ${error.message}`)
  return data ?? []
}

export async function getDecryptedTokens(link: PatreonLinkRow): Promise<PatreonTokens | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('patreon_links')
    .select('access_token_encrypted, refresh_token_encrypted')
    .eq('id', link.id)
    .single()
  if (error) throw new Error(`Failed to read Patreon tokens: ${error.message}`)
  if (!data?.access_token_encrypted || !data?.refresh_token_encrypted) return null

  const [{ data: accessToken, error: accessError }, { data: refreshToken, error: refreshError }] =
    await Promise.all([
      supabase.rpc('decrypt_patreon_token', { p_cipher: data.access_token_encrypted, p_key: getEncryptionKey() }),
      supabase.rpc('decrypt_patreon_token', { p_cipher: data.refresh_token_encrypted, p_key: getEncryptionKey() }),
    ])
  if (accessError) throw accessError
  if (refreshError) throw refreshError

  return { accessToken, refreshToken, expiresAt: link.token_expires_at }
}

export async function deleteLinkForUser(userId: string): Promise<void> {
  const supabase = getSupabaseServiceClient()
  const { error } = await supabase.from('patreon_links').delete().eq('user_id', userId)
  if (error) throw new Error(`Failed to delete Patreon link: ${error.message}`)
}

// The single chokepoint for granting/revoking supporter access based on
// Patreon pledge state. Called from the OAuth callback, the webhook handler,
// and the reconciliation tick — never write profiles.supporter_tier from
// anywhere else in the Patreon integration.
//
// Revocation only ever touches rows where supporter_source is already
// 'patreon', so a manually-granted or admin-granted supporter is never
// clobbered by a patron cancelling or declining a charge.
export async function applyPledgeStateToProfile(userId: string, active: boolean): Promise<void> {
  const supabase = getSupabaseServiceClient()

  if (active) {
    const { data: existing, error: readError } = await supabase
      .from('profiles')
      .select('supporter_source, supporter_since')
      .eq('user_id', userId)
      .maybeSingle()
    if (readError) throw new Error(`Failed to read profile before granting: ${readError.message}`)

    const supporterSince =
      existing?.supporter_source === 'patreon' && existing.supporter_since
        ? existing.supporter_since
        : new Date().toISOString()

    const { error } = await supabase
      .from('profiles')
      .update({ supporter_tier: 'supporter', supporter_source: 'patreon', supporter_since: supporterSince })
      .eq('user_id', userId)
    if (error) throw new Error(`Failed to grant supporter tier: ${error.message}`)
    return
  }

  const { error } = await supabase
    .from('profiles')
    .update({ supporter_tier: null, supporter_source: null, supporter_since: null })
    .eq('user_id', userId)
    .eq('supporter_source', 'patreon')
  if (error) throw new Error(`Failed to revoke supporter tier: ${error.message}`)
}

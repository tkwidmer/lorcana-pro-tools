// Server-side Supabase access for the Metafy supporter integration. Reuses
// the same service-role client as the Discord bot (getSupabaseServiceClient)
// since metafy_links has zero client-facing policies. See
// supabase/migrations/010_metafy_links.sql.
import { getSupabaseServiceClient } from './discordSupabase.js'

export interface MetafyLinkRow {
  id: string
  user_id: string
  metafy_user_id: string
  has_access: boolean
  tier_id: string | null
  last_synced_at: string | null
  updated_at: string
}

export async function upsertMetafyLink(params: {
  userId: string
  metafyUserId: string
  hasAccess: boolean
  tierId: string | null
}): Promise<void> {
  const supabase = getSupabaseServiceClient()

  const row = {
    user_id: params.userId,
    metafy_user_id: params.metafyUserId,
    has_access: params.hasAccess,
    tier_id: params.tierId,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('metafy_links').upsert(row, { onConflict: 'user_id' })
  if (error) throw new Error(`Failed to save Metafy link: ${error.message}`)
}

export async function findLinkByUserId(userId: string): Promise<MetafyLinkRow | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.from('metafy_links').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`Failed to look up Metafy link: ${error.message}`)
  return data
}

export async function listAllLinks(): Promise<MetafyLinkRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.from('metafy_links').select('*')
  if (error) throw new Error(`Failed to list Metafy links: ${error.message}`)
  return data ?? []
}

export async function deleteLinkForUser(userId: string): Promise<void> {
  const supabase = getSupabaseServiceClient()
  const { error } = await supabase.from('metafy_links').delete().eq('user_id', userId)
  if (error) throw new Error(`Failed to delete Metafy link: ${error.message}`)
}

// The single chokepoint for granting/revoking supporter access based on
// Metafy community access. Called from the OAuth callback and the reconcile
// tick — never write profiles.supporter_tier from anywhere else in the
// Metafy integration.
//
// Revocation only ever touches rows where supporter_source is already
// 'metafy', so a manually- or admin-granted supporter (via AdminPage.jsx)
// is never clobbered by a Metafy subscription lapsing.
export async function applyMetafyStateToProfile(userId: string, active: boolean): Promise<void> {
  const supabase = getSupabaseServiceClient()

  if (active) {
    const { data: existing, error: readError } = await supabase
      .from('profiles')
      .select('supporter_source, supporter_since')
      .eq('user_id', userId)
      .maybeSingle()
    if (readError) throw new Error(`Failed to read profile before granting: ${readError.message}`)

    const supporterSince =
      existing?.supporter_source === 'metafy' && existing.supporter_since
        ? existing.supporter_since
        : new Date().toISOString()

    const { error } = await supabase
      .from('profiles')
      .update({ supporter_tier: 'supporter', supporter_source: 'metafy', supporter_since: supporterSince })
      .eq('user_id', userId)
    if (error) throw new Error(`Failed to grant supporter tier: ${error.message}`)
    return
  }

  const { error } = await supabase
    .from('profiles')
    .update({ supporter_tier: null, supporter_source: null, supporter_since: null })
    .eq('user_id', userId)
    .eq('supporter_source', 'metafy')
  if (error) throw new Error(`Failed to revoke supporter tier: ${error.message}`)
}

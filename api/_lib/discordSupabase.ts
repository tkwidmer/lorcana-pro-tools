// Server-side Supabase client for the Discord bot's favorites tracking
// (api/_lib/discordFavorites.ts). Uses the service role key, which bypasses
// RLS — appropriate here since there's no Supabase Auth session involved
// (Discord users aren't web app users). Never expose this key client-side.
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabaseServiceClient(): SupabaseClient {
  if (client) return client

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL) for server-side Supabase access'
    )
  }

  client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  return client
}

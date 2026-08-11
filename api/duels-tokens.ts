import { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseServiceClient } from './_lib/discordSupabase.js'

// Server-side store for each logged-in user's duels.ink API tokens, replacing
// browser-only localStorage (src/lib/duelsApi.js) so tokens carry over across
// devices. Every caller must present their own Supabase session JWT — this
// route verifies it itself and only ever operates on that verified user's
// rows, never a client-supplied id. Token values are encrypted at rest via
// the encrypt_duels_token/get_duels_tokens SQL functions (see
// supabase/migrations/005_duels_api_tokens_crypto_functions.sql), using a
// passphrase that lives only in this function's environment
// (DUELS_TOKEN_ENCRYPTION_KEY) — never returned to the client, never logged.

function getEncryptionKey(): string {
  const key = process.env.DUELS_TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('Missing DUELS_TOKEN_ENCRYPTION_KEY')
  return key
}

async function requireUser(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer token' })
    return null
  }
  const jwt = auth.slice('Bearer '.length)
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid session' })
    return null
  }
  return data.user.id
}

function param(req: VercelRequest, name: string): string | undefined {
  const v = req.query[name]
  return Array.isArray(v) ? v[0] : v
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let userId: string | null
  try {
    userId = await requireUser(req, res)
  } catch (err) {
    console.error('duels-tokens auth check failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Token sync is temporarily unavailable' })
  }
  if (!userId) return

  const supabase = getSupabaseServiceClient()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.rpc('get_duels_tokens', {
        p_user_id: userId,
        p_key: getEncryptionKey(),
      })
      if (error) throw error
      return res.status(200).json({ tokens: data ?? [] })
    }

    if (req.method === 'POST') {
      const { id, label, token, username, duelsUserId } = req.body ?? {}
      if (!id || !token) return res.status(400).json({ error: 'id and token are required' })

      const { count, error: countError } = await supabase
        .from('duels_api_tokens')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      if (countError) throw countError
      const isFirstToken = !count || count === 0

      const { data: cipher, error: encryptError } = await supabase.rpc('encrypt_duels_token', {
        p_plain: token,
        p_key: getEncryptionKey(),
      })
      if (encryptError) throw encryptError

      const { error: upsertError } = await supabase.from('duels_api_tokens').upsert(
        {
          id,
          user_id: userId,
          label: label ?? null,
          token_encrypted: cipher,
          username: username ?? null,
          duels_user_id: duelsUserId ?? null,
          ...(isFirstToken ? { is_active: true } : {}),
        },
        { onConflict: 'user_id,id' }
      )
      if (upsertError) throw upsertError
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'PATCH') {
      const id = param(req, 'id')
      if (!id) return res.status(400).json({ error: 'id is required' })
      const { label, username, duelsUserId, isActive, token } = req.body ?? {}

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (label !== undefined) update.label = label
      if (username !== undefined) update.username = username
      if (duelsUserId !== undefined) update.duels_user_id = duelsUserId
      if (isActive !== undefined) update.is_active = isActive

      if (token !== undefined) {
        const { data: cipher, error: encryptError } = await supabase.rpc('encrypt_duels_token', {
          p_plain: token,
          p_key: getEncryptionKey(),
        })
        if (encryptError) throw encryptError
        update.token_encrypted = cipher
      }

      const { error: updateError } = await supabase
        .from('duels_api_tokens')
        .update(update)
        .eq('user_id', userId)
        .eq('id', id)
      if (updateError) throw updateError

      // Activating one token deactivates the rest for this user.
      if (isActive === true) {
        const { error: deactivateError } = await supabase
          .from('duels_api_tokens')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .neq('id', id)
        if (deactivateError) throw deactivateError
      }

      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const id = param(req, 'id')
      if (!id) return res.status(400).json({ error: 'id is required' })
      const { error: deleteError } = await supabase
        .from('duels_api_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('id', id)
      if (deleteError) throw deleteError
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    // Log server-side only for diagnosis — never include the underlying
    // error detail in the response, since it could leak row existence.
    console.error('duels-tokens request failed:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Failed to sync tokens' })
  }
}

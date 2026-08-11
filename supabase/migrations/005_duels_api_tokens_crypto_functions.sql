-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Encrypt/decrypt helpers for duels_api_tokens.token_encrypted. The passphrase
-- is passed in per-call from api/duels-tokens.ts (sourced from the
-- DUELS_TOKEN_ENCRYPTION_KEY server-only env var) — it is never stored or
-- hardcoded in the database. SECURITY DEFINER with EXECUTE revoked from
-- anon/authenticated so only the service-role connection used by that route
-- can call these. pgcrypto's functions live in the `extensions` schema on
-- Supabase projects, hence the search_path.

CREATE OR REPLACE FUNCTION public.encrypt_duels_token(p_plain text, p_key text)
RETURNS bytea
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT pgp_sym_encrypt(p_plain, p_key);
$$;

CREATE OR REPLACE FUNCTION public.get_duels_tokens(p_user_id uuid, p_key text)
RETURNS TABLE (
  id text,
  label text,
  token text,
  username text,
  duels_user_id text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT t.id, t.label, pgp_sym_decrypt(t.token_encrypted, p_key), t.username,
         t.duels_user_id, t.is_active, t.created_at, t.updated_at
  FROM public.duels_api_tokens t
  WHERE t.user_id = p_user_id
  ORDER BY t.created_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.encrypt_duels_token(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_duels_tokens(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_duels_token(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_duels_tokens(uuid, text) TO service_role;

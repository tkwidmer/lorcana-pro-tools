-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Encrypt/decrypt helpers for patreon_links.access_token_encrypted /
-- refresh_token_encrypted. The passphrase is passed in per-call from
-- api/_lib/patreonSupabase.ts (sourced from the PATREON_TOKEN_ENCRYPTION_KEY
-- server-only env var) — it is never stored or hardcoded in the database.
-- SECURITY DEFINER with EXECUTE revoked from anon/authenticated so only the
-- service-role connection used by those routes can call these. pgcrypto's
-- functions live in the `extensions` schema on Supabase projects, hence the
-- search_path.

CREATE OR REPLACE FUNCTION public.encrypt_patreon_token(p_plain text, p_key text)
RETURNS bytea
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT pgp_sym_encrypt(p_plain, p_key);
$$;

CREATE OR REPLACE FUNCTION public.decrypt_patreon_token(p_cipher bytea, p_key text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT pgp_sym_decrypt(p_cipher, p_key);
$$;

REVOKE EXECUTE ON FUNCTION public.encrypt_patreon_token(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_patreon_token(bytea, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_patreon_token(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_patreon_token(bytea, text) TO service_role;

-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Stores each logged-in user's duels.ink API tokens server-side (replacing
-- browser-only localStorage) so they carry over across devices. Tokens are
-- bearer credentials for the user's duels.ink account, so the token value is
-- encrypted at rest with pgcrypto using a passphrase that lives only as a
-- server-side env var (DUELS_TOKEN_ENCRYPTION_KEY, set in Vercel) — never
-- shipped to the client and never stored in this database. All access goes
-- through api/duels-tokens.ts using the service role key; RLS is enabled
-- with zero policies so the anon/authenticated keys can never read or write
-- this table directly, even if a route is ever misconfigured.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.duels_api_tokens (
  pk               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  id               text        NOT NULL,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label            text,
  token_encrypted  bytea       NOT NULL,
  username         text,
  duels_user_id    text,
  is_active        boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

ALTER TABLE public.duels_api_tokens ENABLE ROW LEVEL SECURITY;

-- Deliberately no policies: RLS is enabled so the web app's anon/authenticated
-- keys can never read or write this table. Access goes exclusively through
-- api/duels-tokens.ts using the service role key, which verifies the caller's
-- Supabase JWT itself before touching this table.

CREATE INDEX IF NOT EXISTS duels_api_tokens_user_id_idx
  ON public.duels_api_tokens (user_id);

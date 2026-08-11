-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Links a logged-in user to their Patreon identity, established via OAuth
-- (see api/patreon-callback.ts), and tracks their pledge status so
-- api/patreon-webhook.ts and api/patreon-reconcile-tick.ts can grant/revoke
-- profiles.supporter_tier accordingly. OAuth tokens are needed to re-poll
-- Patreon's identity endpoint during reconciliation, so they're encrypted at
-- rest with pgcrypto using a passphrase that lives only as a server-side env
-- var (PATREON_TOKEN_ENCRYPTION_KEY, set in Vercel) — never shipped to the
-- client and never stored in this database. All access goes through
-- api/_lib/patreonSupabase.ts using the service role key; RLS is enabled
-- with zero policies so the anon/authenticated keys can never read or write
-- this table directly, even if a route is ever misconfigured.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.patreon_links (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patreon_user_id       text        NOT NULL,
  patron_status         text,
  last_charge_status    text,
  access_token_encrypted  bytea,
  refresh_token_encrypted bytea,
  token_expires_at      timestamptz,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (patreon_user_id)
);

ALTER TABLE public.patreon_links ENABLE ROW LEVEL SECURITY;

-- Deliberately no policies: RLS is enabled so the web app's anon/authenticated
-- keys can never read or write this table. Access goes exclusively through
-- api/patreon-callback.ts, api/patreon-webhook.ts, api/patreon-status.ts, and
-- api/patreon-reconcile-tick.ts using the service role key; the user-facing
-- routes verify the caller's Supabase JWT themselves before touching rows.

CREATE INDEX IF NOT EXISTS patreon_links_patreon_user_id_idx
  ON public.patreon_links (patreon_user_id);

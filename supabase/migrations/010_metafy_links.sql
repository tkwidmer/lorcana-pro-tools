-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Links a logged-in user to their Metafy identity, established via OAuth
-- (see api/metafy.ts's callback handler), and tracks their last-known
-- community access so api/metafy.ts's reconcile-tick handler can grant/
-- revoke profiles.supporter_tier accordingly.
--
-- Unlike patreon_links, no OAuth tokens are stored here. The callback does
-- a one-off access check with the user's freshly-issued token and discards
-- it; reconciliation instead re-derives access from a single owner-scoped
-- API key call (GET /v1/me/community/subscribers) against every linked
-- metafy_user_id, so there's nothing per-user to refresh or encrypt. See
-- api/_lib/metafySupabase.ts.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_supporter_source_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_supporter_source_check
    CHECK (supporter_source IN ('manual', 'patreon', 'kofi', 'metafy'));

CREATE TABLE IF NOT EXISTS public.metafy_links (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metafy_user_id    text        NOT NULL,
  has_access        boolean     NOT NULL DEFAULT false,
  tier_id           text,
  last_synced_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (metafy_user_id)
);

ALTER TABLE public.metafy_links ENABLE ROW LEVEL SECURITY;

-- Deliberately no policies: RLS is enabled so the web app's anon/authenticated
-- keys can never read or write this table. Access goes exclusively through
-- api/metafy.ts using the service role key; the user-facing status endpoint
-- verifies the caller's Supabase JWT itself before touching rows — same
-- pattern as patreon_links, discord_favorite_players, and duels_api_tokens.

CREATE INDEX IF NOT EXISTS metafy_links_metafy_user_id_idx
  ON public.metafy_links (metafy_user_id);

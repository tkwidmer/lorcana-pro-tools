-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Archive of admin-imported major Ravensburger Play Hub (RPH) tournament
-- events — the first feature in this codebase to store real game/tournament
-- domain data server-side (see CLAUDE.md "Stack"). Powers the caster-facing
-- cross-event player history + head-to-head surfaced from a pairing click on
-- /tournament-lookup (api/tournament-history.ts).
--
-- Player identity is joined by RPH's own player id (`rph_player_id`), which is
-- stable across events — the same id `TournamentLookupPage.jsx` already keys
-- its cross-event favorites/team-tag localStorage by. Names are stored too,
-- for display and search, but never used as the identity join key.
--
-- Like discord_favorite_players / duels_api_tokens / patreon_links, these
-- tables are server-owned domain data, not a user's own row: RLS is enabled
-- with zero policies so the web app's anon/authenticated keys can never read
-- or write them directly. All access (import writes, caster reads) goes
-- through api/tournament-history.ts using the service role key.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.tournament_history_events (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rph_event_id           text        NOT NULL UNIQUE,
  event_name             text        NOT NULL,
  event_url              text,
  store_name             text,
  gameplay_format        text,
  top_cut_size           integer,
  total_swiss_rounds     integer     NOT NULL DEFAULT 0,
  has_elimination        boolean     NOT NULL DEFAULT false,
  starting_player_count  integer,
  event_date             date,
  raw_event_details      jsonb,
  imported_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at            timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_history_events ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: see header comment above.

CREATE TABLE IF NOT EXISTS public.tournament_history_standings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid        NOT NULL REFERENCES public.tournament_history_events(id) ON DELETE CASCADE,
  rph_player_id  text        NOT NULL,
  player_name    text        NOT NULL,
  rank           integer,
  match_points   integer,
  record         text,
  made_top_cut   boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, rph_player_id)
);

ALTER TABLE public.tournament_history_standings ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: see header comment above.

CREATE INDEX IF NOT EXISTS tournament_history_standings_player_idx
  ON public.tournament_history_standings (rph_player_id);

CREATE INDEX IF NOT EXISTS tournament_history_standings_name_trgm_idx
  ON public.tournament_history_standings USING gin (player_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.tournament_history_matches (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              uuid        NOT NULL REFERENCES public.tournament_history_events(id) ON DELETE CASCADE,
  rph_match_id          text        NOT NULL,
  round_number          integer     NOT NULL,
  phase_name            text,
  table_number          integer,
  player1_id            text        NOT NULL,
  player1_name          text,
  player2_id            text,
  player2_name          text,
  winner_id             text,
  is_bye                boolean     NOT NULL DEFAULT false,
  is_draw               boolean     NOT NULL DEFAULT false,
  games_won_by_winner   integer,
  games_won_by_loser    integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- Canonical, order-independent pairing key for O(1) head-to-head lookups.
  -- NULL for byes (player2_id is null), so byes never collide with a real pairing.
  player_pair text GENERATED ALWAYS AS (
    CASE WHEN player2_id IS NOT NULL
      THEN LEAST(player1_id, player2_id) || ':' || GREATEST(player1_id, player2_id)
      ELSE NULL
    END
  ) STORED,
  UNIQUE (event_id, rph_match_id)
);

ALTER TABLE public.tournament_history_matches ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: see header comment above.

CREATE INDEX IF NOT EXISTS tournament_history_matches_pair_idx
  ON public.tournament_history_matches (player_pair);

CREATE INDEX IF NOT EXISTS tournament_history_matches_player1_idx
  ON public.tournament_history_matches (player1_id);

CREATE INDEX IF NOT EXISTS tournament_history_matches_player2_idx
  ON public.tournament_history_matches (player2_id);

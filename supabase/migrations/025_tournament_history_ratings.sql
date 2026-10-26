-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Glicko-1 player ratings over the Tournament History archive, one row per
-- RPH player. Derived data: recomputeRatings() (api/_lib/
-- tournamentHistorySupabase.ts) rebuilds every row from the matches table
-- (?endpoint=recompute-ratings, nightly and from the admin import page).
-- `history` is one { rphEventId, eventDate, rating, rd } point per rated event.
--
-- Service-role only, like its sibling tournament_history_* tables: RLS on,
-- zero policies. See docs/agents/tournaments.md "Player ratings".

CREATE TABLE IF NOT EXISTS public.tournament_history_ratings (
  player_id        text        PRIMARY KEY,
  player_name      text,
  rating           numeric     NOT NULL,
  rd               numeric     NOT NULL,
  matches          integer     NOT NULL,
  wins             integer     NOT NULL,
  losses           integer     NOT NULL,
  draws            integer     NOT NULL,
  last_event_date  date        NOT NULL,
  history          jsonb       NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_history_ratings ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: see header comment above.

-- The leaderboard (rd <= 100, by rating) and the read-time rank count.
CREATE INDEX IF NOT EXISTS tournament_history_ratings_board_idx
  ON public.tournament_history_ratings (rd, rating DESC);

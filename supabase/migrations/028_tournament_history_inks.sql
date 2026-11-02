-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Tournament History: the ink pair each player brought to an event, the slot a
-- tournament ink-pair matchup grid will compute from (with
-- tournament_history_matches). Play Hub carries no decks, so nothing fills it
-- yet: NULL means unknown. Lowercase ink names, sorted, as resolveColors()
-- returns them. The RPH import's standings upsert does not send this column,
-- so re-importing an event keeps it.

ALTER TABLE public.tournament_history_standings
  ADD COLUMN IF NOT EXISTS inks text[]
  CONSTRAINT tournament_history_standings_inks_valid CHECK (
    inks IS NULL OR (
      cardinality(inks) BETWEEN 1 AND 2
      AND inks <@ ARRAY['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel']
    )
  );

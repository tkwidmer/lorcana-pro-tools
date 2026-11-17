-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Tournament History: whether an event paid Best Of prizing (a promo to the
-- highest-standing player on each two-ink pair). Play Hub doesn't say, so an
-- admin turns it on from the event's results page. The player page counts the
-- Best Ofs a player won from it and tournament_history_standings.inks.
ALTER TABLE public.tournament_history_events
  ADD COLUMN IF NOT EXISTS best_of_prizing boolean NOT NULL DEFAULT false;

-- DLC London Main Events 1 and 2.
UPDATE public.tournament_history_events
  SET best_of_prizing = true
  WHERE rph_event_id IN ('1254364', '1254365');

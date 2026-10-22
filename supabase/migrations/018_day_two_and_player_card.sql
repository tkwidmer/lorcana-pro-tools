-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- 1. Tournament History: "made Day 2". A DLC runs two Swiss phases (Day One
--    Swiss, Day Two Swiss) before the cut, and every imported match carries
--    its phase name, so a player made Day 2 if they played a match in the
--    event's second Swiss phase — counted only when that phase holds fewer
--    players than started, since a few side events run every player through
--    a second Swiss phase. Precomputed at import like made_top_cut; the
--    UPDATE below backfills events already imported.

ALTER TABLE public.tournament_history_standings
  ADD COLUMN IF NOT EXISTS made_day_two boolean NOT NULL DEFAULT false;

WITH day2 AS (
  SELECT e.id AS event_id, e.starting_player_count,
    (SELECT p->>'phase_name' FROM jsonb_array_elements(e.raw_event_details->'tournament_phases') p
      WHERE p->>'round_type' = 'SWISS' OFFSET 1 LIMIT 1) AS phase_name
  FROM public.tournament_history_events e
), players AS (
  SELECT d.event_id, u.player_id
  FROM day2 d
  JOIN LATERAL (
    SELECT m.player1_id AS player_id FROM public.tournament_history_matches m WHERE m.event_id = d.event_id AND m.phase_name = d.phase_name
    UNION
    SELECT m.player2_id FROM public.tournament_history_matches m WHERE m.event_id = d.event_id AND m.phase_name = d.phase_name
  ) u ON true
  WHERE d.phase_name IS NOT NULL AND d.phase_name <> '' AND u.player_id IS NOT NULL
), real_cuts AS (
  SELECT p.event_id FROM players p JOIN day2 d ON d.event_id = p.event_id
  GROUP BY p.event_id, d.starting_player_count
  HAVING count(*) < d.starting_player_count
)
UPDATE public.tournament_history_standings s
SET made_day_two = true
FROM players p JOIN real_cuts r ON r.event_id = p.event_id
WHERE s.event_id = p.event_id AND s.rph_player_id = p.player_id AND NOT s.made_day_two;

-- 2. Stream Overlay player card: the two players' archive history and
--    head-to-head as one JSON document, written by Tournament Lookup's "Send
--    to Stream Overlay" (the OBS view has no session, so it can't query the
--    archive itself), and whether the live view is showing it over the cam.
--    See CLAUDE.md "Stream Overlay".

ALTER TABLE public.stream_tables
  ADD COLUMN IF NOT EXISTS player_card jsonb,
  ADD COLUMN IF NOT EXISTS card_shown boolean NOT NULL DEFAULT false;

-- Same public shape as 017, plus `player_card` and `card_shown`.
CREATE OR REPLACE FUNCTION public.stream_table_public(t public.stream_tables)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'mode', t.mode,
    'theme_fill', t.theme_fill,
    'theme_accent', t.theme_accent,
    'event_name', t.event_name,
    'event_logo_url', t.event_logo_url,
    'sponsor_logo_url', t.sponsor_logo_url,
    'round', t.round,
    'note', t.note,
    'deck_shown', t.deck_shown,
    'player_card', t.player_card,
    'card_shown', t.card_shown,
    'timer_ends_at', t.timer_ends_at,
    'timer_remaining_ms', t.timer_remaining_ms,
    'rph_event_id', t.rph_event_id,
    'p1_name', t.p1_name, 'p1_record', t.p1_record, 'p1_inks', to_jsonb(t.p1_inks),
    'p1_lore', t.p1_lore, 'p1_game_wins', t.p1_game_wins, 'p1_decklist', t.p1_decklist,
    'p2_name', t.p2_name, 'p2_record', t.p2_record, 'p2_inks', to_jsonb(t.p2_inks),
    'p2_lore', t.p2_lore, 'p2_game_wins', t.p2_game_wins, 'p2_decklist', t.p2_decklist
  );
$$;

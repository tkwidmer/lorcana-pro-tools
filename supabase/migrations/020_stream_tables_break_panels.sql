-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Stream Overlay break-screen content: a standings snapshot and a top-cut
-- bracket snapshot sent from Tournament Lookup, and which of them (or the
-- pairing, the default) the break screen shows. Snapshots because the OBS
-- view has no session; the operator re-sends after each round.
-- See CLAUDE.md "Stream Overlay".

ALTER TABLE public.stream_tables
  ADD COLUMN IF NOT EXISTS standings jsonb,
  ADD COLUMN IF NOT EXISTS bracket jsonb,
  ADD COLUMN IF NOT EXISTS break_panel text NOT NULL DEFAULT '' CHECK (break_panel IN ('', 'standings', 'bracket'));

-- Same public shape as 018, plus `standings`, `bracket` and `break_panel`.
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
    'standings', t.standings,
    'bracket', t.bracket,
    'break_panel', t.break_panel,
    'timer_ends_at', t.timer_ends_at,
    'timer_remaining_ms', t.timer_remaining_ms,
    'rph_event_id', t.rph_event_id,
    'p1_name', t.p1_name, 'p1_record', t.p1_record, 'p1_inks', to_jsonb(t.p1_inks),
    'p1_lore', t.p1_lore, 'p1_game_wins', t.p1_game_wins, 'p1_decklist', t.p1_decklist,
    'p2_name', t.p2_name, 'p2_record', t.p2_record, 'p2_inks', to_jsonb(t.p2_inks),
    'p2_lore', t.p2_lore, 'p2_game_wins', t.p2_game_wins, 'p2_decklist', t.p2_decklist
  );
$$;

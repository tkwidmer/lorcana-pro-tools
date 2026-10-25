-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Stream Overlay: the tournament's metagame, typed into the panel one
-- archetype per line ("Emerald/Steel Midrange 7", or "… 28%"), rendered as a
-- pie over the gameplay cam (meta_shown) or on the break screen
-- (break_panel = 'meta'). meta_players is the field size the "Other" fold
-- reads; null means the sum of the counts. See CLAUDE.md "Stream Overlay".

ALTER TABLE public.stream_tables
  ADD COLUMN IF NOT EXISTS meta_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS meta_players integer,
  ADD COLUMN IF NOT EXISTS meta_shown boolean NOT NULL DEFAULT false;

ALTER TABLE public.stream_tables
  DROP CONSTRAINT stream_tables_break_panel_check,
  ADD CONSTRAINT stream_tables_break_panel_check CHECK (break_panel IN ('', 'standings', 'bracket', 'meta'));

-- Same public shape as 023, plus `meta_text`, `meta_players` and `meta_shown`.
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
    'sponsor2_logo_url', t.sponsor2_logo_url,
    'round', t.round,
    'note', t.note,
    'deck_shown', t.deck_shown,
    'player_card', t.player_card,
    'card_shown', t.card_shown,
    'standings', t.standings,
    'bracket', t.bracket,
    'results', t.results,
    'break_panel', t.break_panel,
    'meta_text', t.meta_text,
    'meta_players', t.meta_players,
    'meta_shown', t.meta_shown,
    'timer_ends_at', t.timer_ends_at,
    'timer_remaining_ms', t.timer_remaining_ms,
    'rph_event_id', t.rph_event_id,
    'p1_name', t.p1_name, 'p1_record', t.p1_record, 'p1_inks', to_jsonb(t.p1_inks),
    'p1_lore', t.p1_lore, 'p1_game_wins', t.p1_game_wins, 'p1_decklist', t.p1_decklist,
    'p2_name', t.p2_name, 'p2_record', t.p2_record, 'p2_inks', to_jsonb(t.p2_inks),
    'p2_lore', t.p2_lore, 'p2_game_wins', t.p2_game_wins, 'p2_decklist', t.p2_decklist
  );
$$;

-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Stream Overlay event theming: the overlay's whole look is a fill (the side
-- columns, banner and break screen) and an accent (borders, lore, pips, the
-- Winner ribbon); the text color on the fill is derived client-side from the
-- fill's luminance. Defaults are the site's ink black and forge gold. See
-- CLAUDE.md "Stream Overlay".

ALTER TABLE public.stream_tables
  ADD COLUMN IF NOT EXISTS theme_fill   text NOT NULL DEFAULT '#17171a' CHECK (theme_fill   ~ '^#[0-9a-fA-F]{6}$'),
  ADD COLUMN IF NOT EXISTS theme_accent text NOT NULL DEFAULT '#b5832a' CHECK (theme_accent ~ '^#[0-9a-fA-F]{6}$');

-- Same public shape as 013, plus the two theme columns.
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
    'timer_ends_at', t.timer_ends_at,
    'timer_remaining_ms', t.timer_remaining_ms,
    'rph_event_id', t.rph_event_id,
    'p1_name', t.p1_name, 'p1_record', t.p1_record, 'p1_inks', to_jsonb(t.p1_inks),
    'p1_lore', t.p1_lore, 'p1_game_wins', t.p1_game_wins,
    'p2_name', t.p2_name, 'p2_record', t.p2_record, 'p2_inks', to_jsonb(t.p2_inks),
    'p2_lore', t.p2_lore, 'p2_game_wins', t.p2_game_wins
  );
$$;

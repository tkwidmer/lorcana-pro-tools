-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Stream Overlay "tables": one row per feature table a supporter streams
-- (see CLAUDE.md "Stream Overlay"). The row IS the overlay state — plain
-- columns, not a JSON blob, so the players' tablet can increment lore
-- atomically in the database and two writers can never lose a tap.
--
-- Access model, three roles:
--   * The owner (control panel, Tournament Lookup hand-off) reads and writes
--     their own rows directly under RLS.
--   * The OBS view and the players' controller are unauthenticated — a
--     Browser Source has no session — so they read through
--     get_stream_table(), a SECURITY DEFINER function that returns the
--     public columns only (never controller_key or owner_id), and get live
--     updates from a trigger that broadcasts the same public shape on the
--     Realtime topic `stream-table:<id>` (public topic, no RLS on messages).
--   * The controller's taps call adjust_stream_table() with the row's
--     controller_key, which rides in the controller link but not the view
--     link, so the view link alone can't change scores.

CREATE TABLE IF NOT EXISTS public.stream_tables (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  controller_key     text        NOT NULL DEFAULT encode(extensions.gen_random_bytes(12), 'hex'),
  name               text        NOT NULL,
  event_name         text        NOT NULL DEFAULT '',
  event_logo_url     text        NOT NULL DEFAULT '',
  sponsor_logo_url   text        NOT NULL DEFAULT '',
  round              text        NOT NULL DEFAULT '',
  -- Wall-time clock target while running; NULL while paused, with the
  -- remainder in timer_remaining_ms. Views tick locally from this.
  timer_ends_at      timestamptz,
  timer_remaining_ms integer     NOT NULL DEFAULT 3000000,
  -- Set by a Tournament Lookup hand-off; while non-null the panel keeps the
  -- clock in step with this RPH event.
  rph_event_id       integer,
  p1_name            text        NOT NULL DEFAULT 'Player 1',
  p1_record          text        NOT NULL DEFAULT '',
  p1_inks            text[]      NOT NULL DEFAULT '{}',
  p1_lore            integer     NOT NULL DEFAULT 0 CHECK (p1_lore BETWEEN 0 AND 99),
  p1_game_wins       integer     NOT NULL DEFAULT 0 CHECK (p1_game_wins BETWEEN 0 AND 2),
  p2_name            text        NOT NULL DEFAULT 'Player 2',
  p2_record          text        NOT NULL DEFAULT '',
  p2_inks            text[]      NOT NULL DEFAULT '{}',
  p2_lore            integer     NOT NULL DEFAULT 0 CHECK (p2_lore BETWEEN 0 AND 99),
  p2_game_wins       integer     NOT NULL DEFAULT 0 CHECK (p2_game_wins BETWEEN 0 AND 2),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stream_tables_owner_idx ON public.stream_tables (owner_id, created_at);

ALTER TABLE public.stream_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON public.stream_tables
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- The public shape: everything the overlay shows, nothing that grants access.
CREATE OR REPLACE FUNCTION public.stream_table_public(t public.stream_tables)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'name', t.name,
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

-- Unauthenticated read for the OBS view and the controller. The id is a
-- random uuid that only ever travels in the links the owner copies.
CREATE OR REPLACE FUNCTION public.get_stream_table(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.stream_table_public(t) FROM public.stream_tables t WHERE t.id = p_id;
$$;

-- One tap from the players' controller: an atomic, clamped increment of one
-- player's lore or game wins, gated by the controller key.
CREATE OR REPLACE FUNCTION public.adjust_stream_table(
  p_id uuid, p_key text, p_side integer, p_field text, p_delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_side NOT IN (1, 2) OR p_field NOT IN ('lore', 'game_wins') OR p_delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid adjust: side %, field %, delta %', p_side, p_field, p_delta;
  END IF;

  UPDATE public.stream_tables SET
    p1_lore      = CASE WHEN p_side = 1 AND p_field = 'lore'      THEN greatest(0, least(99, p1_lore + p_delta))     ELSE p1_lore END,
    p1_game_wins = CASE WHEN p_side = 1 AND p_field = 'game_wins' THEN greatest(0, least(2,  p1_game_wins + p_delta)) ELSE p1_game_wins END,
    p2_lore      = CASE WHEN p_side = 2 AND p_field = 'lore'      THEN greatest(0, least(99, p2_lore + p_delta))     ELSE p2_lore END,
    p2_game_wins = CASE WHEN p_side = 2 AND p_field = 'game_wins' THEN greatest(0, least(2,  p2_game_wins + p_delta)) ELSE p2_game_wins END
  WHERE id = p_id AND controller_key = p_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown stream table or controller key';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stream_table(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_stream_table(uuid, text, integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stream_table(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stream_table(uuid, text, integer, text, integer) TO anon, authenticated;

-- Every change (owner edit, controller tap) is pushed to whoever is showing
-- the table. Public topic so the unauthenticated view/controller can listen.
CREATE OR REPLACE FUNCTION public.stream_tables_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  PERFORM realtime.send(public.stream_table_public(NEW), 'state', 'stream-table:' || NEW.id::text, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stream_tables_broadcast ON public.stream_tables;
CREATE TRIGGER stream_tables_broadcast
  BEFORE INSERT OR UPDATE ON public.stream_tables
  FOR EACH ROW EXECUTE FUNCTION public.stream_tables_broadcast();

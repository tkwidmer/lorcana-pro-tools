-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Stream Overlay "Next game": zero both players' lore in one call. The taps
-- only move lore by one, so without this a 20-14 game took 34 taps to clear.
-- Gated by the controller key like adjust_stream_table, so the players'
-- tablet and the panel use the same path. See CLAUDE.md "Stream Overlay".

CREATE OR REPLACE FUNCTION public.reset_stream_table_lore(p_id uuid, p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.stream_tables SET p1_lore = 0, p2_lore = 0
  WHERE id = p_id AND controller_key = p_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown stream table or controller key';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_stream_table_lore(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_stream_table_lore(uuid, text) TO anon, authenticated;

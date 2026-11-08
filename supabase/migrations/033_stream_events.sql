-- Stream Overlay event log: what went wrong on which surface of which table,
-- so an overlay failure leaves evidence instead of a vague report. Written
-- only through log_stream_event() (no RLS policies, so no direct reads or
-- writes from clients); read with SQL as an admin or the service role.
-- Surfaces log transitions (first failure, recovery), never every repeat.

CREATE TABLE public.stream_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES public.stream_tables(id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface IN ('panel', 'view', 'control', 'notes')),
  kind text NOT NULL CHECK (char_length(kind) <= 64),
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stream_events_table_created ON public.stream_events (table_id, created_at DESC);

ALTER TABLE public.stream_events ENABLE ROW LEVEL SECURITY;

-- The OBS view, controller and notes have no session, so logging is a
-- SECURITY DEFINER function like the public read. An unknown table id is
-- dropped, and detail is cut to 2000 characters.
-- ponytail: no rate limit; a caller with a table id can fill the log. Add a
-- per-table cap here if that ever happens.
CREATE OR REPLACE FUNCTION public.log_stream_event(p_table_id uuid, p_surface text, p_kind text, p_detail text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.stream_events (table_id, surface, kind, detail)
  SELECT p_table_id, p_surface, p_kind, left(coalesce(p_detail, ''), 2000)
  WHERE EXISTS (SELECT 1 FROM public.stream_tables WHERE id = p_table_id);
$$;

GRANT EXECUTE ON FUNCTION public.log_stream_event(uuid, text, text, text) TO anon, authenticated;

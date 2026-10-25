-- A stale control panel (an earlier event's link still open in another tab,
-- running old code) wrote that event's long-expired round clock into the row
-- every poll, which read as 00:00 on stream. Refuse any update that moves the
-- clock target to more than 30 minutes in the past: keep the row's clock.
-- Named to sort before stream_tables_broadcast so the broadcast carries the
-- kept values.
CREATE OR REPLACE FUNCTION public.stream_tables_keep_clock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.timer_ends_at IS NOT NULL
     AND NEW.timer_ends_at IS DISTINCT FROM OLD.timer_ends_at
     AND NEW.timer_ends_at < now() - interval '30 minutes' THEN
    NEW.timer_ends_at := OLD.timer_ends_at;
    NEW.timer_remaining_ms := OLD.timer_remaining_ms;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER stream_tables_a_keep_clock
  BEFORE UPDATE ON public.stream_tables
  FOR EACH ROW EXECUTE FUNCTION public.stream_tables_keep_clock();

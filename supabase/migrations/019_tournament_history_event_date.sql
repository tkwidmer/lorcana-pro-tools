-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Backfill event_date from the stored RPH payload. The import read
-- `start_date` / `event_date`, which RPH never sends (its field is
-- `start_datetime`, plus a `timezone`), so every event imported before this
-- migration has NULL here — and every "newest first" sort over the archive
-- was a no-op. raw_event_details holds the original payload, so this is a
-- pure derivation. Idempotent: only touches NULL rows.
UPDATE public.tournament_history_events
SET event_date = ((raw_event_details->>'start_datetime')::timestamptz
                  AT TIME ZONE COALESCE(NULLIF(raw_event_details->>'timezone', ''), 'UTC'))::date
WHERE event_date IS NULL
  AND raw_event_details->>'start_datetime' IS NOT NULL;

-- The public event page reads one event's elimination-phase matches.
CREATE INDEX IF NOT EXISTS tournament_history_matches_event_idx
  ON public.tournament_history_matches (event_id, phase_name);

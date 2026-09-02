-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Adds an automatic event-tier signal to tournament_history_events, powering
-- the "Notable Pairing Badges" feature (pedigree/rivalry badges in
-- TournamentLookupPage's Matches tab and EliminationBracket). RPH's event API
-- exposes event_configuration_template (a UUID) — the same field driving the
-- public site's "Category" filter — so tier is derived automatically at
-- import time (api/_lib/tournamentImport.ts's deriveEventTier), no admin
-- tagging required.
--
-- event_tier is plain text, not an enum: new tiers (e.g. Worlds, once
-- scheduled on RPH) can be added in code alone, no migration needed.
-- Pre-existing rows and unrecognized template UUIDs get event_tier = NULL,
-- which the pedigree query treats as "not notable" (fail-safe: badges are
-- conservatively absent, never incorrectly present).

ALTER TABLE public.tournament_history_events
  ADD COLUMN IF NOT EXISTS event_configuration_template uuid,
  ADD COLUMN IF NOT EXISTS event_tier text;

CREATE INDEX IF NOT EXISTS tournament_history_events_tier_idx
  ON public.tournament_history_events (event_tier);

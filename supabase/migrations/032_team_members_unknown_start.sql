-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Team Tracker: a membership may have an unknown start. NULL joined_on means
-- "since before the archive began": the member counts for every archived
-- event up to their leaving date (isMemberOn() in api/_lib/teams.ts). Most
-- rosters are entered long after the team formed, and defaulting to today
-- hid every past event. No default any more: the editor sends a date or null.

ALTER TABLE public.team_members ALTER COLUMN joined_on DROP NOT NULL;
ALTER TABLE public.team_members ALTER COLUMN joined_on DROP DEFAULT;
-- The existing CHECK (left_on IS NULL OR left_on >= joined_on) passes when
-- joined_on is NULL (the comparison is unknown, which CHECK accepts).

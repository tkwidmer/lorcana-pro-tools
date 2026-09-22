-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Drops the legacy Patreon integration's storage. The Patreon OAuth
-- integration itself (api/patreon.ts and friends) was removed in favor of
-- Metafy — see CLAUDE.md's "Metafy Integration" section. This migration
-- finishes that removal at the database level.
--
-- Confirmed safe before writing this migration: patreon_links held exactly
-- 2 rows, both with patron_status = NULL (never an active patron — one was
-- the app owner's own test connection, already a manual/admin supporter via
-- an unrelated grant; the other never received any supporter access at
-- all). Zero rows in profiles carry supporter_source = 'patreon'. So this
-- drop discards no real subscriber data and revokes no one's access.

DROP FUNCTION IF EXISTS public.encrypt_patreon_token(text, text);
DROP FUNCTION IF EXISTS public.decrypt_patreon_token(bytea, text);
DROP TABLE IF EXISTS public.patreon_links;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_supporter_source_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_supporter_source_check
    CHECK (supporter_source IN ('manual', 'kofi', 'metafy'));

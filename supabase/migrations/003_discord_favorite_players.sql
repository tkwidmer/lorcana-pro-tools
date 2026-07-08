-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Tracks players favorited via the Discord bot's /favorite command, so the
-- scheduled tick (api/discord-tournament-tick.ts) knows who to check on and
-- which channel to post updates to. This is only ever accessed server-side
-- (the bot's Vercel functions, using the Supabase service role key) — there
-- is no Supabase Auth session involved, since Discord users aren't web app
-- users.
CREATE TABLE IF NOT EXISTS public.discord_favorite_players (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id          text        NOT NULL,
  channel_id        text        NOT NULL,
  event_id          text        NOT NULL,
  event_url         text        NOT NULL,
  player_id         text        NOT NULL,
  player_name       text        NOT NULL,
  requested_by      text        NOT NULL,
  active            boolean     NOT NULL DEFAULT true,
  last_rank         integer,
  last_record       text,
  last_match_points integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, event_id, player_id)
);

ALTER TABLE public.discord_favorite_players ENABLE ROW LEVEL SECURITY;

-- Deliberately no policies: RLS is enabled so the web app's anon/authenticated
-- keys can never read or write this table. Server-side access goes through
-- the service role key, which bypasses RLS entirely.

CREATE INDEX IF NOT EXISTS discord_favorite_players_active_idx
  ON public.discord_favorite_players (active)
  WHERE active;

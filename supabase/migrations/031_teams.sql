-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Team Tracker (docs/superpowers/specs/2026-11-06-team-tracker-design.md):
-- a curated directory of teams and dated player memberships, joined to the
-- Tournament History archive by RPH's stable player id. Service-role only,
-- like the tournament_history_* tables: RLS on, zero policies; every read
-- and write goes through api/tournament-history.ts (api/_lib/teamsSupabase.ts).

CREATE TABLE IF NOT EXISTS public.teams (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 48),
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  url             text,                                                      -- the team's own site or social link
  logo_url        text,                                                      -- public URL in the stream-logos bucket (migration 016)
  manager_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,  -- may edit this team's roster
  disbanded_on    date,                                                      -- set by dissolve_team(); read-only while non-null
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  rph_player_id text        NOT NULL,   -- the archive's join key (tournament_history_standings.rph_player_id)
  player_name   text        NOT NULL,   -- display only
  joined_on     date        NOT NULL DEFAULT current_date,
  left_on       date        CHECK (left_on IS NULL OR left_on >= joined_on),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One open membership per player per team; a player may rejoin after leaving.
CREATE UNIQUE INDEX IF NOT EXISTS team_members_open_idx ON public.team_members (team_id, rph_player_id) WHERE left_on IS NULL;
CREATE INDEX IF NOT EXISTS team_members_player_idx ON public.team_members (rph_player_id);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: see header comment above.

-- Dissolve: stamp the team and close every open membership on the same date,
-- atomically. Returns the date used. Raises if already disbanded.
CREATE OR REPLACE FUNCTION public.dissolve_team(p_team_id uuid)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := current_date;
  v_disbanded date;
BEGIN
  SELECT disbanded_on INTO v_disbanded FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team not found' USING ERRCODE = 'P0002'; END IF;
  IF v_disbanded IS NOT NULL THEN RAISE EXCEPTION 'team already disbanded' USING ERRCODE = 'P0003'; END IF;
  UPDATE public.team_members SET left_on = v_today WHERE team_id = p_team_id AND left_on IS NULL;
  UPDATE public.teams SET disbanded_on = v_today, updated_at = now() WHERE id = p_team_id;
  RETURN v_today;
END;
$$;

-- Reinstate (admins only, enforced in the API): clear the stamp and reopen
-- only the memberships the dissolution closed (left_on = disbanded_on); a
-- member who had left earlier stays former. Returns how many were reopened.
CREATE OR REPLACE FUNCTION public.reinstate_team(p_team_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disbanded date;
  v_count integer;
BEGIN
  SELECT disbanded_on INTO v_disbanded FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team not found' USING ERRCODE = 'P0002'; END IF;
  IF v_disbanded IS NULL THEN RAISE EXCEPTION 'team is not disbanded' USING ERRCODE = 'P0003'; END IF;
  UPDATE public.team_members SET left_on = NULL WHERE team_id = p_team_id AND left_on = v_disbanded;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.teams SET disbanded_on = NULL, updated_at = now() WHERE id = p_team_id;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.dissolve_team(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reinstate_team(uuid) FROM public, anon, authenticated;

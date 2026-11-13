-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Tournament Lookup's starred players, per signed-in user, keyed by the
-- Ravensburger player id (stable across events) so a favorite carries over
-- between tournaments. Signed-out visitors keep theirs in localStorage
-- (`lorcana_tournament_favorites`), uploaded here on their first signed-in
-- load (src/lib/tournamentFavorites.js). Owner-only under RLS.
CREATE TABLE IF NOT EXISTS public.tournament_favorites (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id  text        NOT NULL,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, player_id)
);

ALTER TABLE public.tournament_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON public.tournament_favorites
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

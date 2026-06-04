-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

CREATE TABLE IF NOT EXISTS public.profiles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email           text        NOT NULL,
  supporter_tier  text        CHECK (supporter_tier IN ('supporter')) DEFAULT NULL,
  supporter_source text       CHECK (supporter_source IN ('manual', 'patreon', 'kofi')) DEFAULT NULL,
  supporter_since timestamptz DEFAULT NULL,
  created_at      timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile; admin can read all
CREATE POLICY "select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'email') = 'tkwidmer@gmail.com'
  );

-- Users can create their own profile (needed for existing users on first login)
CREATE POLICY "insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only admin can grant or revoke supporter status
CREATE POLICY "update_admin_only"
  ON public.profiles FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'tkwidmer@gmail.com');

-- Auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

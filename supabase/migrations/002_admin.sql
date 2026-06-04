-- Run this in the Supabase SQL editor after 001_profiles.sql

-- Expand supporter_tier to include 'admin'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_supporter_tier_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_supporter_tier_check
  CHECK (supporter_tier IN ('supporter', 'admin'));

-- Security-definer function checks admin tier without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT supporter_tier = 'admin' FROM public.profiles WHERE user_id = auth.uid()),
    false
  );
$$;

-- Recreate policies to use is_admin(); keep JWT email as bootstrap fallback
-- so tkwidmer@gmail.com always has access even before their profile tier is set
DROP POLICY IF EXISTS "select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "update_admin_only" ON public.profiles;

CREATE POLICY "select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_admin()
    OR (auth.jwt() ->> 'email') = 'tkwidmer@gmail.com'
  );

CREATE POLICY "update_admin_only"
  ON public.profiles FOR UPDATE
  USING (
    public.is_admin()
    OR (auth.jwt() ->> 'email') = 'tkwidmer@gmail.com'
  );

-- Grant admin tier to tkwidmer if their profile already exists
UPDATE public.profiles
SET supporter_tier = 'admin', supporter_source = 'manual', supporter_since = now()
WHERE email = 'tkwidmer@gmail.com';

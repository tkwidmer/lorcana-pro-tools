import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { initTokenSync } from '../lib/duelsApi'
import { AuthContext } from './authContext'

// Single source of truth for auth + supporter state. Runs the Supabase session
// check, the onAuthStateChange subscription, the profile-row ensure, and the
// supporter-tier fetch exactly once for the whole app — useAuth and
// useSupporter read from this context instead of each spinning up their own.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [tier, setTier] = useState(null)
  const [supporterLoading, setSupporterLoading] = useState(true)

  // Auth session + subscription (once).
  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          console.error('Session check error:', error)
          setError(error.message)
          setUser(null)
        } else {
          setUser(data.session?.user ?? null)
          setError(null)
        }
        setAuthLoading(false)
      })
      .catch((err) => {
        if (!mounted) return
        console.error('Session check error:', err)
        setError(err.message)
        setUser(null)
        setAuthLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return
        setUser(session?.user ?? null)
      }
    )

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  // Sync duels.ink API tokens (Supabase-backed) whenever the user changes.
  useEffect(() => {
    if (authLoading) return
    initTokenSync(user?.id ?? null)
  }, [user, authLoading])

  // Ensure a profile row exists and load the supporter tier (once per user).
  useEffect(() => {
    if (authLoading) return
    let cancelled = false

    const loadProfile = async () => {
      if (!user) {
        if (!cancelled) {
          setTier(null)
          setSupporterLoading(false)
        }
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('id, supporter_tier')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return

      if (!data) {
        // First login for this user — create their profile row.
        await supabase.from('profiles').insert({ user_id: user.id, email: user.email })
        if (!cancelled) setTier(null)
      } else if (!cancelled) {
        setTier(data.supporter_tier ?? null)
      }

      if (!cancelled) setSupporterLoading(false)
    }

    loadProfile()
    return () => { cancelled = true }
  }, [user, authLoading])

  const value = useMemo(
    () => ({ user, error, authLoading, tier, supporterLoading }),
    [user, error, authLoading, tier, supporterLoading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

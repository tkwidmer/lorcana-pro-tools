import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

async function ensureProfile(user) {
  const { data } = await supabase.from('profiles').select('id').eq('user_id', user.id).single()
  if (!data) {
    await supabase.from('profiles').insert({ user_id: user.id, email: user.email })
  }
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isMounted = true

    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        if (isMounted) {
          const u = data.session?.user ?? null
          setUser(u)
          setError(null)
          if (u) ensureProfile(u)
        }
      } catch (err) {
        if (isMounted) {
          console.error('Session check error:', err)
          setError(err.message)
          setUser(null)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return
        const u = session?.user ?? null
        setUser(u)
        if (u) ensureProfile(u)
      }
    )

    return () => {
      isMounted = false
      subscription?.unsubscribe()
    }
  }, [])

  return { user, isLoading, error }
}

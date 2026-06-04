import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useSupporter() {
  const { user, isLoading: authLoading } = useAuth()
  const [tier, setTier] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      setTier(null)
      setIsLoading(false)
      return
    }

    const loadProfile = async () => {
      const { data: existing } = await supabase
        .from('profiles')
        .select('supporter_tier')
        .eq('user_id', user.id)
        .single()

      if (existing) {
        setTier(existing.supporter_tier ?? null)
        setIsLoading(false)
        return
      }

      // Profile missing — user signed up before profiles table existed
      await supabase.from('profiles').insert({ user_id: user.id, email: user.email })
      setTier(null)
      setIsLoading(false)
    }

    loadProfile()
  }, [user, authLoading])

  return {
    isSupporter: tier === 'supporter',
    tier,
    isLoading: authLoading || isLoading,
  }
}

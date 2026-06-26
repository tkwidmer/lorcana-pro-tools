import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useSupporter() {
  const { user, isLoading: authLoading } = useAuth()
  const [tier, setTier] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    let cancelled = false

    const loadProfile = async () => {
      if (!user) {
        if (!cancelled) {
          setTier(null)
          setIsLoading(false)
        }
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('supporter_tier')
        .eq('user_id', user.id)
        .single()

      if (!cancelled) {
        setTier(data?.supporter_tier ?? null)
        setIsLoading(false)
      }
    }

    loadProfile()
    return () => { cancelled = true }
  }, [user, authLoading])

  return {
    user,
    isAdmin: tier === 'admin',
    isSupporter: tier === 'supporter' || tier === 'admin',
    tier,
    isLoading: authLoading || isLoading,
  }
}

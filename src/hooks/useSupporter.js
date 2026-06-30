import { useContext } from 'react'
import { AuthContext } from '../context/authContext'

// Reads the shared supporter state from AuthProvider. Return shape is unchanged:
// isSupporter is true for both the 'supporter' and 'admin' tiers.
export function useSupporter() {
  const { user, tier, authLoading, supporterLoading } = useContext(AuthContext)
  return {
    user,
    isAdmin: tier === 'admin',
    isSupporter: tier === 'supporter' || tier === 'admin',
    tier,
    isLoading: authLoading || supporterLoading,
  }
}

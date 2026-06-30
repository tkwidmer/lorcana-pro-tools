import { useContext } from 'react'
import { AuthContext } from '../context/authContext'

// Reads the shared auth state from AuthProvider. Return shape is unchanged from
// the previous standalone implementation.
export function useAuth() {
  const ctx = useContext(AuthContext)
  return { user: ctx.user, isLoading: ctx.authLoading, error: ctx.error }
}

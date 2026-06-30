import { createContext } from 'react'

// Shared auth + supporter state. Provided by AuthProvider; consumed by the
// useAuth and useSupporter hooks. Kept in its own file so the provider module
// only exports a component (Fast Refresh friendly).
export const AuthContext = createContext(null)

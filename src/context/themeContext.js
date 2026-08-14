import { createContext } from 'react'

// Shared theme state. Provided by ThemeProvider; consumed by the useTheme
// hook. Kept in its own file so the provider module only exports a component
// (Fast Refresh friendly), matching authContext.js.
export const ThemeContext = createContext(null)

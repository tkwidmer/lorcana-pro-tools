import { useContext } from 'react'
import { ThemeContext } from '../context/themeContext'

// Reads the shared theme state from ThemeProvider.
//   theme         — the stored preference: 'light' | 'dark' | 'system'
//   resolvedTheme — what's actually applied: 'light' | 'dark'
//   setTheme      — persists a new preference and applies it immediately
export function useTheme() {
  const ctx = useContext(ThemeContext)
  return {
    theme: ctx?.theme ?? 'system',
    resolvedTheme: ctx?.resolvedTheme ?? 'light',
    setTheme: ctx?.setTheme ?? (() => {}),
  }
}

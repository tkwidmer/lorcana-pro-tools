import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  applyResolvedTheme,
  normalizeTheme,
  prefersDark,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  subscribeToSystemTheme,
} from '../lib/theme'
import { ThemeContext } from './themeContext'

// Owns the theme preference for the whole app: reads the stored choice,
// tracks the OS setting so 'system' stays live, and keeps the `dark` class on
// <html> in sync. The class is applied before first paint by the inline
// script in index.html — this provider takes over from there.
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme)

  // Follow the OS setting live. Subscribed unconditionally rather than only
  // while the preference is 'system', so switching back to 'system' picks up
  // the current value immediately.
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, prefersDark, () => false)

  const resolvedTheme = resolveTheme(theme, systemDark)

  useEffect(() => {
    applyResolvedTheme(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = useCallback(next => {
    const normalized = normalizeTheme(next)
    storeTheme(normalized)
    setThemeState(normalized)
  }, [])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

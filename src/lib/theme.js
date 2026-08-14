// Theme preference storage and resolution.
//
// A preference is one of 'light' | 'dark' | 'system'. 'system' follows the
// OS/browser `prefers-color-scheme` setting and is the default. The resolved
// theme ('light' | 'dark') is what actually gets applied to the document, by
// toggling the `dark` class on <html> — see the token remap in index.css.
//
// The same storage key and normalization rules are duplicated by the inline
// no-flash script in index.html, which applies the class before first paint.
// Keep the two in sync.

export const THEME_STORAGE_KEY = 'lorcana_theme'

export const THEME_OPTIONS = ['light', 'dark', 'system']

export const DARK_CLASS = 'dark'

// Anything unrecognized (missing key, a value from an older build, a user
// hand-editing localStorage) falls back to following the system setting.
export function normalizeTheme(value) {
  return THEME_OPTIONS.includes(value) ? value : 'system'
}

export function resolveTheme(theme, systemPrefersDark) {
  if (theme === 'light' || theme === 'dark') return theme
  return systemPrefersDark ? 'dark' : 'light'
}

export function readStoredTheme() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    // Private mode / blocked storage — fall back to the system setting.
    return 'system'
  }
}

export function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme))
  } catch {
    // Preference just won't persist; the in-memory state still applies.
  }
}

export function prefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Subscribe shape for useSyncExternalStore — fires whenever the OS/browser
// color-scheme setting changes, so a 'system' preference stays live.
export function subscribeToSystemTheme(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function applyResolvedTheme(resolved, root) {
  const el = root ?? (typeof document !== 'undefined' ? document.documentElement : null)
  if (!el) return
  el.classList.toggle(DARK_CLASS, resolved === 'dark')
}

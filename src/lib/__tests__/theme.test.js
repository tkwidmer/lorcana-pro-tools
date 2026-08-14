import { describe, it, expect, afterEach } from 'vitest'
import {
  THEME_STORAGE_KEY,
  THEME_OPTIONS,
  DARK_CLASS,
  normalizeTheme,
  resolveTheme,
  readStoredTheme,
  storeTheme,
  prefersDark,
  subscribeToSystemTheme,
  applyResolvedTheme,
} from '../theme'

// The suite runs in Node, so there's no real localStorage/document. Stub only
// what each test needs and clean up after.
function stubStorage(initial = {}) {
  const store = { ...initial }
  globalThis.localStorage = {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value) },
  }
  return store
}

function fakeRoot(initialClasses = []) {
  const classes = new Set(initialClasses)
  return {
    classes,
    classList: {
      toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)),
    },
  }
}

afterEach(() => {
  delete globalThis.localStorage
  delete globalThis.window
})

describe('normalizeTheme', () => {
  it('accepts the three known preferences', () => {
    for (const option of THEME_OPTIONS) {
      expect(normalizeTheme(option)).toBe(option)
    }
  })

  it('falls back to system for anything unrecognized', () => {
    expect(normalizeTheme(null)).toBe('system')
    expect(normalizeTheme(undefined)).toBe('system')
    expect(normalizeTheme('')).toBe('system')
    expect(normalizeTheme('Dark')).toBe('system')
    expect(normalizeTheme('sepia')).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('honors an explicit preference regardless of the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system setting for the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('treats an unknown preference as system', () => {
    expect(resolveTheme('sepia', true)).toBe('dark')
    expect(resolveTheme(undefined, false)).toBe('light')
  })
})

describe('readStoredTheme / storeTheme', () => {
  it('round-trips a stored preference', () => {
    stubStorage()
    storeTheme('dark')
    expect(readStoredTheme()).toBe('dark')
  })

  it('normalizes on the way in and on the way out', () => {
    const store = stubStorage()
    storeTheme('nonsense')
    expect(store[THEME_STORAGE_KEY]).toBe('system')

    store[THEME_STORAGE_KEY] = 'nonsense'
    expect(readStoredTheme()).toBe('system')
  })

  it('defaults to system when nothing is stored', () => {
    stubStorage()
    expect(readStoredTheme()).toBe('system')
  })

  it('survives storage being unavailable', () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(readStoredTheme()).toBe('system')
    expect(() => storeTheme('dark')).not.toThrow()
  })
})

describe('prefersDark', () => {
  it('is false when matchMedia is unavailable', () => {
    expect(prefersDark()).toBe(false)
  })

  it('reports the media query result', () => {
    globalThis.window = { matchMedia: query => ({ matches: query.includes('dark') }) }
    expect(prefersDark()).toBe(true)

    globalThis.window = { matchMedia: () => ({ matches: false }) }
    expect(prefersDark()).toBe(false)
  })
})

describe('subscribeToSystemTheme', () => {
  it('returns a no-op unsubscribe when matchMedia is unavailable', () => {
    const unsubscribe = subscribeToSystemTheme(() => {})
    expect(() => unsubscribe()).not.toThrow()
  })

  it('adds and removes a change listener on the media query', () => {
    const listeners = []
    globalThis.window = {
      matchMedia: () => ({
        matches: false,
        addEventListener: (event, fn) => listeners.push([event, fn]),
        removeEventListener: (event, fn) => {
          const i = listeners.findIndex(([e, f]) => e === event && f === fn)
          if (i !== -1) listeners.splice(i, 1)
        },
      }),
    }

    const onChange = () => {}
    const unsubscribe = subscribeToSystemTheme(onChange)
    expect(listeners).toEqual([['change', onChange]])

    unsubscribe()
    expect(listeners).toEqual([])
  })
})

describe('applyResolvedTheme', () => {
  it('adds the dark class for dark and removes it for light', () => {
    const root = fakeRoot()
    applyResolvedTheme('dark', root)
    expect(root.classes.has(DARK_CLASS)).toBe(true)

    applyResolvedTheme('light', root)
    expect(root.classes.has(DARK_CLASS)).toBe(false)
  })

  it('clears a stale class baked into the document', () => {
    const root = fakeRoot([DARK_CLASS])
    applyResolvedTheme('light', root)
    expect(root.classes.has(DARK_CLASS)).toBe(false)
  })

  it('is a no-op without a document', () => {
    expect(() => applyResolvedTheme('dark')).not.toThrow()
  })
})

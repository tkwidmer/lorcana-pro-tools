import { useEffect, useState } from 'react'
import {
  getTokens,
  getActiveTokenId,
  addToken,
  removeToken,
  setActiveToken,
  updateTokenLabel,
  updateTokenUsername,
  testToken,
  waitForTokenSync,
  subscribeTokens,
} from '../lib/duelsApi'
import { supabase } from '../lib/supabaseClient'
import { useTheme } from '../hooks/useTheme'

async function patreonFetch(method) {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) throw new Error('Not signed in')
  const res = await fetch('/api/patreon-status', {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Patreon status request failed (${res.status})`)
  return res.json()
}

function usePatreonStatus() {
  const [status, setStatus] = useState(null) // null while loading, else { connected, patronStatus?, lastSyncedAt? }
  const [error, setError] = useState(null)

  async function refresh() {
    try {
      const result = await patreonFetch('GET')
      setStatus(result)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    let cancelled = false
    patreonFetch('GET')
      .then(result => { if (!cancelled) { setStatus(result); setError(null) } })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  return { status, error, refresh }
}

async function connectPatreon() {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) throw new Error('Not signed in')

  const clientId = import.meta.env.VITE_PATREON_CLIENT_ID
  if (!clientId) throw new Error('Patreon integration is not configured yet')

  const redirectUri = `${window.location.origin}/api/patreon-callback`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'identity identity.memberships',
    state: accessToken,
  })
  window.location.href = `https://www.patreon.com/oauth2/authorize?${params.toString()}`
}

const THEME_CHOICES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

function AppearanceCard() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <h2 className="text-base font-bold text-gray-900 mb-1">Appearance</h2>
      <p className="text-sm text-gray-500 mb-5">
        Choose a color theme. It applies to every page and is remembered on this device.
      </p>

      <div role="radiogroup" aria-label="Color theme" className="flex flex-wrap gap-2">
        {THEME_CHOICES.map(choice => {
          const isSelected = theme === choice.value
          return (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setTheme(choice.value)}
              className={`text-sm font-medium px-4 py-2 rounded border transition-colors ${
                isSelected
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 text-gray-700 hover:border-gray-900'
              }`}
            >
              {choice.label}
            </button>
          )
        })}
      </div>

      {theme === 'system' && (
        <p className="text-xs text-gray-400 mt-3">
          Following your device setting — currently {resolvedTheme}.
        </p>
      )}
    </div>
  )
}

function useTokenStore() {
  const [tokens, setTokens] = useState(() => getTokens())
  const [activeId, setActiveId] = useState(() => getActiveTokenId())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    function sync() {
      if (cancelled) return
      setTokens(getTokens())
      setActiveId(getActiveTokenId())
      setLoading(false)
    }
    // Covers the sync already having finished (or being in flight) by the
    // time this mounts, AND any real sync that only completes afterward —
    // e.g. on a hard refresh, AuthProvider's initTokenSync() kicks off
    // asynchronously after its own auth check resolves, which can finish
    // well after this component's initial mount.
    waitForTokenSync().then(sync)
    const unsubscribe = subscribeTokens(sync)
    return () => { cancelled = true; unsubscribe() }
  }, [])

  function refresh() {
    setTokens(getTokens())
    setActiveId(getActiveTokenId())
  }

  return { tokens, activeId, loading, refresh }
}

export function SettingsPage() {
  const { tokens, activeId, loading, refresh } = useTokenStore()
  const { status: patreonStatus, refresh: refreshPatreon } = usePatreonStatus()
  const [patreonBanner, setPatreonBanner] = useState(null) // null | 'connected' | 'error'
  const [patreonBusy, setPatreonBusy] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('patreon')
    if (result === 'connected' || result === 'error') {
      setPatreonBanner(result)
      params.delete('patreon')
      const newSearch = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''))
      if (result === 'connected') refreshPatreon()
    }
    // Only meant to run once, reading the query param set by the OAuth
    // redirect on mount — not meant to re-run if refreshPatreon changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConnectPatreon() {
    setPatreonBusy(true)
    try {
      await connectPatreon()
    } catch {
      setPatreonBanner('error')
      setPatreonBusy(false)
    }
  }

  async function handleDisconnectPatreon() {
    setPatreonBusy(true)
    try {
      await patreonFetch('DELETE')
      await refreshPatreon()
    } finally {
      setPatreonBusy(false)
    }
  }

  // Per-token UI state
  const [showToken, setShowToken] = useState({}) // id → bool
  const [editLabel, setEditLabel] = useState({}) // id → string | undefined
  const [editUsername, setEditUsername] = useState({}) // id → string | undefined
  const [testStatus, setTestStatus] = useState({}) // id → null|'loading'|'ok'|{error}
  const [rowError, setRowError] = useState({}) // id → string | undefined

  // Add-token form
  const [newLabel, setNewLabel] = useState('')
  const [newTokenValue, setNewTokenValue] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [addStatus, setAddStatus] = useState(null) // null | 'added' | { error }

  function toggleShow(id) {
    setShowToken(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleActivate(id) {
    try {
      await setActiveToken(id)
      refresh()
    } catch (err) {
      setRowError(prev => ({ ...prev, [id]: err.message }))
    }
  }

  async function handleRemove(id) {
    try {
      await removeToken(id)
      refresh()
      setTestStatus(prev => { const n = { ...prev }; delete n[id]; return n })
      setShowToken(prev => { const n = { ...prev }; delete n[id]; return n })
      setEditLabel(prev => { const n = { ...prev }; delete n[id]; return n })
      setEditUsername(prev => { const n = { ...prev }; delete n[id]; return n })
      setRowError(prev => { const n = { ...prev }; delete n[id]; return n })
    } catch (err) {
      setRowError(prev => ({ ...prev, [id]: err.message }))
    }
  }

  async function handleLabelBlur(id) {
    const label = editLabel[id]
    if (label !== undefined) {
      try {
        await updateTokenLabel(id, label)
        refresh()
      } catch (err) {
        setRowError(prev => ({ ...prev, [id]: err.message }))
      }
      setEditLabel(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  function handleLabelKeyDown(id, e) {
    if (e.key === 'Enter') e.target.blur()
    if (e.key === 'Escape') {
      setEditLabel(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  async function handleUsernameBlur(id) {
    const username = editUsername[id]
    if (username !== undefined) {
      try {
        await updateTokenUsername(id, username)
        refresh()
      } catch (err) {
        setRowError(prev => ({ ...prev, [id]: err.message }))
      }
      setEditUsername(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  function handleUsernameKeyDown(id, e) {
    if (e.key === 'Enter') e.target.blur()
    if (e.key === 'Escape') {
      setEditUsername(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  async function handleTest(id, token) {
    setTestStatus(prev => ({ ...prev, [id]: 'loading' }))
    try {
      await testToken(token)
      setTestStatus(prev => ({ ...prev, [id]: 'ok' }))
    } catch (err) {
      setTestStatus(prev => ({ ...prev, [id]: { error: err.message } }))
    }
  }

  async function handleAdd() {
    if (!newTokenValue.trim()) return
    try {
      await addToken(newLabel, newTokenValue)
      setNewLabel('')
      setNewTokenValue('')
      setShowNew(false)
      setAddStatus('added')
      setTimeout(() => setAddStatus(null), 2000)
      refresh()
    } catch (err) {
      setAddStatus({ error: err.message })
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-500 text-sm">Configure appearance, integrations, and API tokens.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-1 lg:order-2 flex flex-col gap-6">
          <AppearanceCard />

          <div className="border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-1">
              <img src="/patreon-icon.svg" alt="" className="h-5 w-5 shrink-0" />
              <h2 className="text-base font-bold text-gray-900">Patreon</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Connect your Patreon account — an active pledge automatically grants Supporter access.
            </p>

            {patreonBanner === 'connected' && (
              <p className="text-sm text-green-600 font-medium mb-4">✓ Patreon connected.</p>
            )}
            {patreonBanner === 'error' && (
              <p className="text-sm text-red-600 font-medium mb-4">Something went wrong connecting Patreon. Please try again.</p>
            )}

            {patreonStatus === null && (
              <p className="text-sm text-gray-400">Loading Patreon status…</p>
            )}

            {patreonStatus?.connected === false && (
              <button
                type="button"
                onClick={handleConnectPatreon}
                disabled={patreonBusy}
                className="border border-gray-900 text-sm font-medium px-4 py-2 hover:bg-gray-900 hover:text-white transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {patreonBusy ? 'Connecting…' : 'Connect Patreon'}
              </button>
            )}

            {patreonStatus?.connected === true && (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">Connected</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Status: {patreonStatus.patronStatus ?? 'unknown'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnectPatreon}
                  disabled={patreonBusy}
                  className="mt-3 border border-gray-300 text-xs font-medium px-3 py-1.5 text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {patreonBusy ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-6 lg:col-span-2 lg:order-1">
          <h2 className="text-base font-bold text-gray-900 mb-1">duels.ink API Tokens</h2>
          <p className="text-sm text-gray-500 mb-5">
            Add tokens for each team member. Get tokens from the API section at{' '}
            <a
              href="https://duels.ink/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-900 transition-colors"
            >
              duels.ink/settings
            </a>
            . The <span className="font-medium text-gray-700">active</span> token is used when loading match history. Tokens are saved to your account, encrypted, and available on any device you sign into.
          </p>

          {loading && (
            <p className="text-sm text-gray-400 mb-5">Loading your tokens…</p>
          )}

          {!loading && tokens.length > 0 && (
            <div className="mb-6 space-y-3">
              {tokens.map(t => {
                const isActive = t.id === activeId || (activeId === null && tokens[0].id === t.id)
                const labelValue = editLabel[t.id] !== undefined ? editLabel[t.id] : t.label
                const usernameValue = editUsername[t.id] !== undefined ? editUsername[t.id] : (t.username ?? '')
                const status = testStatus[t.id]
                const visible = showToken[t.id] ?? false
                const error = rowError[t.id]

                return (
                  <div
                    key={t.id}
                    className={`border rounded-lg p-4 transition-colors ${isActive ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {/* Active toggle */}
                      <button
                        type="button"
                        onClick={() => handleActivate(t.id)}
                        title={isActive ? 'Active token' : 'Set as active'}
                        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                          isActive
                            ? 'border-gray-900 bg-gray-900'
                            : 'border-gray-300 hover:border-gray-500'
                        }`}
                        aria-pressed={isActive}
                      />

                      {/* Label */}
                      <input
                        type="text"
                        value={labelValue}
                        onChange={e => setEditLabel(prev => ({ ...prev, [t.id]: e.target.value }))}
                        onBlur={() => handleLabelBlur(t.id)}
                        onKeyDown={e => handleLabelKeyDown(t.id, e)}
                        className="flex-1 text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-gray-900 focus:outline-none py-0.5 transition-colors"
                        aria-label="Token label"
                      />

                      {isActive && (
                        <span className="text-xs font-medium text-gray-500 bg-gray-200 rounded px-2 py-0.5 flex-shrink-0">
                          Active
                        </span>
                      )}
                    </div>

                    {/* Username row */}
                    <div className="flex items-center gap-2 mb-2 pl-7">
                      <span className="text-xs text-gray-400 flex-shrink-0 w-20">Username</span>
                      <input
                        type="text"
                        value={usernameValue}
                        onChange={e => setEditUsername(prev => ({ ...prev, [t.id]: e.target.value }))}
                        onBlur={() => handleUsernameBlur(t.id)}
                        onKeyDown={e => handleUsernameKeyDown(t.id, e)}
                        placeholder="duels.ink username (optional)"
                        className="flex-1 text-xs text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-gray-900 focus:outline-none py-0.5 transition-colors placeholder:text-gray-300"
                        aria-label="duels.ink username"
                      />
                      {t.userId && (
                        <span className="text-xs text-gray-300 font-mono flex-shrink-0 truncate max-w-24" title={t.userId}>
                          {t.userId.slice(0, 8)}…
                        </span>
                      )}
                    </div>

                    {/* Token value row */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-mono text-xs text-gray-500 flex-1 truncate">
                        {visible ? t.token : '•'.repeat(Math.min(t.token.length, 40))}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleShow(t.id)}
                        className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
                      >
                        {visible ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    {/* Actions row */}
                    <div className="flex flex-wrap items-center gap-2">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => handleActivate(t.id)}
                          className="border border-gray-900 text-xs font-medium px-3 py-1.5 hover:bg-gray-900 hover:text-white transition-colors rounded"
                        >
                          Set active
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleTest(t.id, t.token)}
                        disabled={status === 'loading'}
                        className="border border-gray-900 text-xs font-medium px-3 py-1.5 hover:bg-gray-900 hover:text-white transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {status === 'loading' ? 'Testing…' : 'Test connection'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(t.id)}
                        className="border border-gray-300 text-xs font-medium px-3 py-1.5 text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors rounded"
                      >
                        Remove
                      </button>

                      {status && status !== 'loading' && (
                        <span className={`text-xs font-medium ${status === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                          {status === 'ok' ? '✓ Valid' : `✗ ${status.error}`}
                        </span>
                      )}
                    </div>

                    {error && (
                      <p className="text-xs text-red-600 mt-2">Failed to save: {error}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add token form */}
          <div className="border border-dashed border-gray-300 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Add token</p>
            <div className="flex flex-col gap-2 mb-3">
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Label (e.g. Alice's account)"
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              />
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newTokenValue}
                  onChange={e => setNewTokenValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="Paste token here"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono pr-14 focus:outline-none focus:border-gray-900"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                >
                  {showNew ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newTokenValue.trim()}
                className="border border-gray-900 text-sm font-medium px-4 py-2 hover:bg-gray-900 hover:text-white transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add token
              </button>
              {addStatus === 'added' && (
                <span className="text-sm text-green-600 font-medium">Added</span>
              )}
              {addStatus && addStatus !== 'added' && (
                <span className="text-sm text-red-600 font-medium">Failed to save: {addStatus.error}</span>
              )}
            </div>
          </div>
        </div>
        </div>
    </div>
  )
}

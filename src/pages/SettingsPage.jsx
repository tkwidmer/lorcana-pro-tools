import { useState } from 'react'
import {
  getTokens,
  getActiveTokenId,
  addToken,
  removeToken,
  setActiveToken,
  updateTokenLabel,
  updateTokenUsername,
  testToken,
} from '../lib/duelsApi'

function useTokenStore() {
  const [tokens, setTokens] = useState(() => getTokens())
  const [activeId, setActiveId] = useState(() => getActiveTokenId())

  function refresh() {
    setTokens(getTokens())
    setActiveId(getActiveTokenId())
  }

  return { tokens, activeId, refresh }
}

export function SettingsPage() {
  const { tokens, activeId, refresh } = useTokenStore()

  // Per-token UI state
  const [showToken, setShowToken] = useState({}) // id → bool
  const [editLabel, setEditLabel] = useState({}) // id → string | undefined
  const [editUsername, setEditUsername] = useState({}) // id → string | undefined
  const [testStatus, setTestStatus] = useState({}) // id → null|'loading'|'ok'|{error}

  // Add-token form
  const [newLabel, setNewLabel] = useState('')
  const [newTokenValue, setNewTokenValue] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [addStatus, setAddStatus] = useState(null) // null | 'added'

  function toggleShow(id) {
    setShowToken(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function handleActivate(id) {
    setActiveToken(id)
    refresh()
  }

  function handleRemove(id) {
    removeToken(id)
    refresh()
    setTestStatus(prev => { const n = { ...prev }; delete n[id]; return n })
    setShowToken(prev => { const n = { ...prev }; delete n[id]; return n })
    setEditLabel(prev => { const n = { ...prev }; delete n[id]; return n })
    setEditUsername(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function handleLabelBlur(id) {
    const label = editLabel[id]
    if (label !== undefined) {
      updateTokenLabel(id, label)
      setEditLabel(prev => { const n = { ...prev }; delete n[id]; return n })
      refresh()
    }
  }

  function handleLabelKeyDown(id, e) {
    if (e.key === 'Enter') e.target.blur()
    if (e.key === 'Escape') {
      setEditLabel(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  function handleUsernameBlur(id) {
    const username = editUsername[id]
    if (username !== undefined) {
      updateTokenUsername(id, username)
      setEditUsername(prev => { const n = { ...prev }; delete n[id]; return n })
      refresh()
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

  function handleAdd() {
    if (!newTokenValue.trim()) return
    addToken(newLabel, newTokenValue)
    setNewLabel('')
    setNewTokenValue('')
    setShowNew(false)
    setAddStatus('added')
    setTimeout(() => setAddStatus(null), 2000)
    refresh()
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-500 text-sm">Configure integrations and API tokens.</p>
      </div>

      <div className="border border-gray-200 rounded-lg p-6 max-w-2xl">
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
          . The <span className="font-medium text-gray-700">active</span> token is used when loading match history. Tokens are stored only in your browser.
        </p>

        {tokens.length > 0 && (
          <div className="mb-6 space-y-3">
            {tokens.map(t => {
              const isActive = t.id === activeId || (activeId === null && tokens[0].id === t.id)
              const labelValue = editLabel[t.id] !== undefined ? editLabel[t.id] : t.label
              const usernameValue = editUsername[t.id] !== undefined ? editUsername[t.id] : (t.username ?? '')
              const status = testStatus[t.id]
              const visible = showToken[t.id] ?? false

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
          </div>
        </div>
      </div>
    </div>
  )
}

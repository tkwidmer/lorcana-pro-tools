import { useState } from 'react'
import { getToken, setToken, clearToken, fetchMatchHistory } from '../lib/duelsApi'

export function SettingsPage() {
  const [token, setTokenState] = useState(() => getToken())
  const [showToken, setShowToken] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // null | 'saved'
  const [testStatus, setTestStatus] = useState(null) // null | 'loading' | 'ok' | { error: string }

  function handleSave() {
    setToken(token)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus(null), 2000)
  }

  function handleClear() {
    clearToken()
    setTokenState('')
    setTestStatus(null)
    setSaveStatus(null)
  }

  async function handleTest() {
    setTestStatus('loading')
    try {
      await fetchMatchHistory({ limit: 1 })
      setTestStatus('ok')
    } catch (err) {
      setTestStatus({ error: err.message })
    }
  }

  const savedToken = getToken()

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-500 text-sm">Configure integrations and API tokens.</p>
      </div>

      <div className="border border-gray-200 rounded-lg p-6 max-w-lg">
        <h2 className="text-base font-bold text-gray-900 mb-1">duels.ink API Token</h2>
        <p className="text-sm text-gray-500 mb-4">
          Get your token from the API section at{' '}
          <a
            href="https://duels.ink/settings"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-900 transition-colors"
          >
            duels.ink/settings
          </a>
          . Your token is stored only in your browser.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="api-token">
            API Token
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                id="api-token"
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => setTokenState(e.target.value)}
                placeholder="Paste your token here"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono pr-16 focus:outline-none focus:border-gray-900"
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                aria-label={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={handleSave}
            className="border border-gray-900 text-sm font-medium px-4 py-2 hover:bg-gray-900 hover:text-white transition-colors rounded"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={!token || testStatus === 'loading'}
            className="border border-gray-900 text-sm font-medium px-4 py-2 hover:bg-gray-900 hover:text-white transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testStatus === 'loading' ? 'Testing…' : 'Test connection'}
          </button>
          {savedToken && (
            <button
              type="button"
              onClick={handleClear}
              className="border border-gray-300 text-sm font-medium px-4 py-2 text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-colors rounded"
            >
              Clear token
            </button>
          )}
          {saveStatus === 'saved' && (
            <span className="text-sm text-green-600 font-medium">Saved</span>
          )}
        </div>

        {testStatus && testStatus !== 'loading' && (
          <div className={`text-sm font-medium ${testStatus === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {testStatus === 'ok'
              ? '✓ Connected — token is valid'
              : `✗ ${testStatus.error}`}
          </div>
        )}
      </div>
    </div>
  )
}

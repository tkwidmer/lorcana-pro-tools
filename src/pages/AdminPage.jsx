import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useSupporter } from '../hooks/useSupporter'

export function AdminPage() {
  const { isAdmin, isLoading } = useSupporter()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [supporters, setSupporters] = useState([])
  const [searching, setSearching] = useState(false)
  const [updating, setUpdating] = useState(null) // user_id being updated

  useEffect(() => {
    if (!isLoading && !isAdmin) navigate('/', { replace: true })
  }, [isAdmin, isLoading, navigate])

  useEffect(() => {
    if (!isAdmin) return
    supabase
      .from('profiles')
      .select('user_id, email, supporter_since')
      .eq('supporter_tier', 'supporter')
      .order('supporter_since', { ascending: false })
      .then(({ data }) => setSupporters(data ?? []))
  }, [isAdmin])

  async function search(e) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('user_id, email, supporter_tier, is_admin')
      .ilike('email', `%${query.trim()}%`)
      .limit(20)
    setResults(data ?? [])
    setSearching(false)
  }

  async function grant(userId) {
    setUpdating(userId)
    await supabase
      .from('profiles')
      .update({ supporter_tier: 'supporter', supporter_source: 'manual', supporter_since: new Date().toISOString() })
      .eq('user_id', userId)
    setResults(r => r.map(u => u.user_id === userId ? { ...u, supporter_tier: 'supporter' } : u))
    setSupporters(s => {
      const updated = results.find(u => u.user_id === userId)
      if (!updated) return s
      return [{ ...updated, supporter_tier: 'supporter', supporter_since: new Date().toISOString() }, ...s]
    })
    setUpdating(null)
  }

  async function revoke(userId) {
    setUpdating(userId)
    await supabase
      .from('profiles')
      .update({ supporter_tier: null, supporter_source: null, supporter_since: null })
      .eq('user_id', userId)
    setResults(r => r.map(u => u.user_id === userId ? { ...u, supporter_tier: null } : u))
    setSupporters(s => s.filter(u => u.user_id !== userId))
    setUpdating(null)
  }

  if (isLoading) return null

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold">Admin — Supporter Access</h1>

      <section>
        <h2 className="text-lg font-semibold mb-3">Grant or revoke access</h2>
        <form onSubmit={search} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by email…"
            className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {results.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {results.map(u => (
                <tr key={u.user_id}>
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">
                    {u.supporter_tier === 'supporter'
                      ? <span className="text-green-600 dark:text-green-400 font-medium">Supporter</span>
                      : <span className="text-gray-400">Free</span>}
                  </td>
                  <td className="py-2 text-right">
                    {u.supporter_tier === 'supporter' ? (
                      <button
                        onClick={() => revoke(u.user_id)}
                        disabled={updating === u.user_id}
                        className="px-3 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                      >
                        {updating === u.user_id ? '…' : 'Revoke'}
                      </button>
                    ) : (
                      <button
                        onClick={() => grant(u.user_id)}
                        disabled={updating === u.user_id || u.is_admin}
                        className="px-3 py-1 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50"
                      >
                        {updating === u.user_id ? '…' : 'Grant'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Current supporters</h2>
        {supporters.length === 0 ? (
          <p className="text-sm text-gray-500">No supporters yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Since</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {supporters.map(u => (
                <tr key={u.user_id}>
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">
                    {u.supporter_since ? new Date(u.supporter_since).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => revoke(u.user_id)}
                      disabled={updating === u.user_id}
                      className="px-3 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                    >
                      {updating === u.user_id ? '…' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

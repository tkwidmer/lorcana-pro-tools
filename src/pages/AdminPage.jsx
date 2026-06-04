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
  const [updating, setUpdating] = useState(null)

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
      .select('user_id, email, supporter_tier')
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
      return [{ ...updated, supporter_since: new Date().toISOString() }, ...s]
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
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Admin</h1>
        <p className="text-gray-500 text-sm">Manage supporter access.</p>
      </div>

      <div className="space-y-8 max-w-2xl">
        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Grant or revoke access</h2>
          <form onSubmit={search} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by email…"
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
            <button
              type="submit"
              disabled={searching}
              className="border border-gray-900 text-sm font-medium px-4 py-2 hover:bg-gray-900 hover:text-white transition-colors rounded disabled:opacity-40"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>

          {results.length > 0 && (
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map(u => (
                  <tr key={u.user_id}>
                    <td className="py-2 pr-4 text-gray-900">{u.email}</td>
                    <td className="py-2 pr-4">
                      {u.supporter_tier === 'supporter'
                        ? <span className="text-green-600 font-medium">Supporter</span>
                        : <span className="text-gray-400">Free</span>}
                    </td>
                    <td className="py-2 text-right">
                      {u.supporter_tier === 'supporter' ? (
                        <button
                          onClick={() => revoke(u.user_id)}
                          disabled={updating === u.user_id}
                          className="border border-gray-300 text-xs font-medium px-3 py-1.5 text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors rounded disabled:opacity-40"
                        >
                          {updating === u.user_id ? '…' : 'Revoke'}
                        </button>
                      ) : (
                        <button
                          onClick={() => grant(u.user_id)}
                          disabled={updating === u.user_id}
                          className="border border-gray-900 text-xs font-medium px-3 py-1.5 hover:bg-gray-900 hover:text-white transition-colors rounded disabled:opacity-40"
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
        </div>

        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Current supporters</h2>
          {supporters.length === 0 ? (
            <p className="text-sm text-gray-500">No supporters yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Since</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {supporters.map(u => (
                  <tr key={u.user_id}>
                    <td className="py-2 pr-4 text-gray-900">{u.email}</td>
                    <td className="py-2 pr-4 text-gray-500">
                      {u.supporter_since ? new Date(u.supporter_since).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => revoke(u.user_id)}
                        disabled={updating === u.user_id}
                        className="border border-gray-300 text-xs font-medium px-3 py-1.5 text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors rounded disabled:opacity-40"
                      >
                        {updating === u.user_id ? '…' : 'Revoke'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

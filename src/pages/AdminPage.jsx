import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useSupporter } from '../hooks/useSupporter'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'

function StatusLabel({ tier }) {
  if (tier === 'admin') return <Badge tone="neutral">Admin</Badge>
  if (tier === 'supporter') return <Badge>Supporter</Badge>
  return <span className="text-gray-400">Free</span>
}

// Admins are managed outside this page (SQL), so no Grant/Revoke action is offered for them here —
// showing "Grant" for an admin row would silently downgrade them to supporter_tier: 'supporter'.
function GrantRevokeButton({ tier, userId, updating, onGrant, onRevoke }) {
  if (tier === 'admin') return <span className="text-xs text-gray-300">—</span>
  if (tier === 'supporter') {
    return (
      <Button variant="danger" size="sm" onClick={() => onRevoke(userId)} disabled={updating === userId}>
        {updating === userId ? '…' : 'Revoke'}
      </Button>
    )
  }
  return (
    <Button size="sm" onClick={() => onGrant(userId)} disabled={updating === userId}>
      {updating === userId ? '…' : 'Grant'}
    </Button>
  )
}

export function AdminPage() {
  const { isAdmin, isLoading } = useSupporter()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [supporters, setSupporters] = useState([])
  const [searching, setSearching] = useState(false)
  const [updating, setUpdating] = useState(null)
  const [allUsers, setAllUsers] = useState([])
  const [allUsersLoading, setAllUsersLoading] = useState(true)
  const [userFilter, setUserFilter] = useState('')

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

  useEffect(() => {
    if (!isAdmin) return
    supabase
      .from('profiles')
      .select('user_id, email, supporter_tier, created_at')
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data }) => setAllUsers(data ?? []))
      .finally(() => setAllUsersLoading(false))
  }, [isAdmin])

  const filteredAllUsers = allUsers.filter((u) => {
    const q = userFilter.trim().toLowerCase()
    return !q || u.email.toLowerCase().includes(q)
  })

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
      const updated = results.find(u => u.user_id === userId) ?? allUsers.find(u => u.user_id === userId)
      if (!updated) return s
      return [{ ...updated, supporter_since: new Date().toISOString() }, ...s]
    })
    setAllUsers(u => u.map(x => x.user_id === userId ? { ...x, supporter_tier: 'supporter' } : x))
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
    setAllUsers(u => u.map(x => x.user_id === userId ? { ...x, supporter_tier: null } : x))
    setUpdating(null)
  }

  if (isLoading) return null

  return (
    <div className="w-full px-6 py-8">
      <PageHeader title="Admin" description="Manage supporter access." />

      <div className="space-y-8 max-w-2xl">
        <Card
          className="p-6"
          title="Tournament history"
          description="Import major RPH events into the caster history archive."
        >
          <Button to="/admin/tournament-import">Import events</Button>
        </Card>

        <Card className="p-6" title="Grant or revoke access">
          <form onSubmit={search} className="flex gap-2">
            <Input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by email…"
              className="flex-1"
            />
            <Button variant="primary" type="submit" disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </Button>
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
                      <StatusLabel tier={u.supporter_tier} />
                    </td>
                    <td className="py-2 text-right">
                      <GrantRevokeButton tier={u.supporter_tier} userId={u.user_id} updating={updating} onGrant={grant} onRevoke={revoke} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-6" title="Current supporters">
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
                      <Button variant="danger" size="sm" onClick={() => revoke(u.user_id)} disabled={updating === u.user_id}>
                        {updating === u.user_id ? '…' : 'Revoke'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          className="p-6"
          title={<>All users {!allUsersLoading && <span className="text-gray-400 font-sans normal-case tracking-normal">({allUsers.length})</span>}</>}
        >
          <Input
            type="text"
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
            placeholder="Filter by email…"
            className="w-full mb-4"
          />
          {allUsersLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : filteredAllUsers.length === 0 ? (
            <p className="text-sm text-gray-500">No users found.</p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Joined</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAllUsers.map(u => (
                    <tr key={u.user_id}>
                      <td className="py-2 pr-4 text-gray-900">{u.email}</td>
                      <td className="py-2 pr-4">
                        <StatusLabel tier={u.supporter_tier} />
                      </td>
                      <td className="py-2 pr-4 text-gray-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-2 text-right">
                        <GrantRevokeButton tier={u.supporter_tier} userId={u.user_id} updating={updating} onGrant={grant} onRevoke={revoke} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSupporter } from '../hooks/useSupporter'
import { fetchAdminTeams, saveTeam, searchProfiles, reinstateTeam } from '../lib/tournamentHistoryApi'
import { formatEventDate } from '../lib/resultsArchive'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { TeamLogo } from '../components/TeamLogo'
import { ArchiveLoading } from '../components/ResultsArchive'

// Admin side of the Team Tracker: create teams and hand each to a manager.
// Rosters are edited on /teams/:slug/manage, the same page managers use.

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

// Inline email search over profiles (admin-only endpoint) → pick a user.
function ManagerPicker({ onPick, onCancel }) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState({ q: '', profiles: [] })
  const q = query.trim()

  useEffect(() => {
    if (q.length < 3) return
    let cancelled = false
    const t = setTimeout(() => {
      searchProfiles(q)
        .then((data) => { if (!cancelled) setFound({ q, profiles: data.profiles ?? [] }) })
        .catch(() => { if (!cancelled) setFound({ q, profiles: [] }) })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by email…" aria-label="Search users by email" className="py-1 min-w-0 flex-1 sm:flex-none sm:w-64" />
        <Button variant="quiet" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
      {q.length >= 3 && (
        <div className="absolute z-10 mt-1 w-full sm:w-80 bg-white border border-gray-200 rounded-lg shadow-sm max-h-64 overflow-y-auto">
          {q !== found.q ? (
            <p className="px-3 py-2 text-sm text-gray-500">Searching…</p>
          ) : found.profiles.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No users match. They need to have signed in once.</p>
          ) : (
            found.profiles.map((p) => (
              <button key={p.user_id} type="button" onClick={() => onPick(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                {p.email}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function AdminTeamsPage() {
  const { isAdmin, isLoading } = useSupporter()
  const navigate = useNavigate()
  const [teams, setTeams] = useState(null)
  const [status, setStatus] = useState(null) // { kind, text }
  const [picking, setPicking] = useState(null) // team id whose manager is being chosen
  const [draft, setDraft] = useState({ name: '', slug: '', url: '', slugTouched: false })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAdmin) navigate('/', { replace: true })
  }, [isAdmin, isLoading, navigate])

  const load = useCallback(() => {
    if (!isAdmin) return
    fetchAdminTeams()
      .then((data) => setTeams(data.teams))
      .catch((err) => setStatus({ kind: 'error', text: err.message || 'Failed to load teams' }))
  }, [isAdmin])

  useEffect(() => { load() }, [load])

  async function act(label, fn) {
    setStatus(null)
    try {
      await fn()
      setStatus({ kind: 'ok', text: label })
      load()
    } catch (err) {
      setStatus({ kind: 'error', text: err.message || 'Something went wrong' })
    }
  }

  async function create(e) {
    e.preventDefault()
    setCreating(true)
    await act(`Created ${draft.name}`, async () => {
      await saveTeam({ name: draft.name.trim(), slug: draft.slug, url: draft.url || null, logoUrl: null })
      setDraft({ name: '', slug: '', url: '', slugTouched: false })
    })
    setCreating(false)
  }

  const setManager = (team, managerUserId) =>
    act(managerUserId ? 'Manager assigned' : 'Manager removed', () =>
      saveTeam({ id: team.id, name: team.name, url: team.url, logoUrl: team.logoUrl, managerUserId })
    ).then(() => setPicking(null))

  if (isLoading || !isAdmin) return null

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Teams"
        description="Create teams and hand each one to a manager. Managers edit rosters; only admins create teams, change slugs or change managers."
        actions={<Button to="/admin" variant="quiet">← Admin</Button>}
      />

      {status && (
        <p className={`text-sm mb-4 ${status.kind === 'error' ? 'text-red-700' : 'text-green-700'}`} role="status">{status.text}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6" title="New team">
          <form onSubmit={create} className="space-y-3">
            <label className="block">
              <span className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Name</span>
              <Input
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: draft.slugTouched ? draft.slug : slugify(e.target.value) })}
                className="w-full"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Slug</span>
              <Input
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                minLength={2}
                maxLength={48}
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value, slugTouched: true })}
                className="w-full font-mono"
              />
              <span className="block text-xs text-gray-400 mt-1">/teams/{draft.slug || '…'} · lowercase, digits, hyphens</span>
            </label>
            <label className="block">
              <span className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Link (optional)</span>
              <Input type="url" value={draft.url} placeholder="https://" onChange={(e) => setDraft({ ...draft, url: e.target.value })} className="w-full" />
            </label>
            <Button type="submit" variant="primary" disabled={creating}>{creating ? 'Creating…' : 'Create team'}</Button>
          </form>
        </Card>

        <Card className="p-6 lg:col-span-2" title="Teams">
          {teams === null ? (
            <ArchiveLoading />
          ) : teams.length === 0 ? (
            <p className="text-sm text-gray-500">No teams yet.</p>
          ) : (
            <table className="w-full text-sm block sm:table">
              <thead className="hidden sm:table-header-group">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="py-1.5 pr-4">Team</th>
                  <th className="py-1.5 pr-4 text-right">Members</th>
                  <th className="py-1.5 pr-4">Manager</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {teams.map((t) => {
                  const disbanded = Boolean(t.disbandedOn)
                  return (
                    <tr key={t.id} className={`block sm:table-row py-1.5 sm:py-0 border-b border-gray-100 align-top ${disbanded ? 'text-gray-500' : ''}`}>
                      <td className="block sm:table-cell py-0.5 sm:py-2 pr-4">
                        <Link to={`/teams/${t.slug}`} className="inline-flex items-center gap-2 hover:underline">
                          <TeamLogo name={t.name} logoUrl={t.logoUrl} size="h-6 w-6" muted={disbanded} className="text-[10px]" />
                          <span className={disbanded ? '' : 'text-gray-900 font-medium'}>{t.name}</span>
                        </Link>
                        <span className="text-xs text-gray-400 ml-2 font-mono">{t.slug}</span>
                        {disbanded && <Badge tone="neutral" className="ml-2">Disbanded {formatEventDate(t.disbandedOn)}</Badge>}
                      </td>
                      <td className="block sm:table-cell py-0.5 sm:py-2 pr-4 sm:text-right tabular-nums">
                        {t.current}<span className="sm:hidden"> members</span>
                        {t.former > 0 && <span className="text-xs text-gray-400"> · {t.former} former</span>}
                      </td>
                      <td className="block sm:table-cell py-0.5 sm:py-2 pr-4">
                        {disbanded ? (
                          <span className="text-gray-400">{t.managerEmail ?? 'No manager'}</span>
                        ) : picking === t.id ? (
                          <ManagerPicker onPick={(p) => setManager(t, p.user_id)} onCancel={() => setPicking(null)} />
                        ) : t.managerEmail ? (
                          <>
                            {t.managerEmail}{' '}
                            <button type="button" className="text-xs text-forge-ink hover:underline" onClick={() => setPicking(t.id)}>Change</button>
                            {' · '}
                            <button type="button" className="text-xs text-forge-ink hover:underline" onClick={() => setManager(t, null)}>Remove</button>
                          </>
                        ) : (
                          <>
                            <span className="text-gray-400">No manager</span>{' '}
                            <button type="button" className="text-xs text-forge-ink hover:underline" onClick={() => setPicking(t.id)}>Assign</button>
                          </>
                        )}
                      </td>
                      <td className="block sm:table-cell py-0.5 sm:py-2 sm:text-right whitespace-nowrap">
                        {disbanded ? (
                          <Button size="sm" variant="quiet" onClick={() => act('Team reinstated', () => reinstateTeam(t.id))}>Reinstate</Button>
                        ) : (
                          <Button size="sm" to={`/teams/${t.slug}/manage`}>Manage roster</Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <p className="text-xs text-gray-400 mt-4">
            A manager must have signed in once (they need a profile). Removing a manager leaves the team and roster untouched.
            Manager emails appear here only; nothing public shows who manages a team.
          </p>
        </Card>
      </div>
    </div>
  )
}

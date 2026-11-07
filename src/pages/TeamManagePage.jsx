import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchTeam,
  fetchMyTeams,
  saveTeam,
  saveTeamMember,
  deleteTeamMember,
  dissolveTeam,
  reinstateTeam,
  searchTournamentPlayers,
} from '../lib/tournamentHistoryApi'
import { uploadLogo } from '../lib/streamTables'
import { splitRoster } from '../lib/teams'
import { formatEventDate } from '../lib/resultsArchive'
import { useSupporter } from '../hooks/useSupporter'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { TeamLogo } from '../components/TeamLogo'
import { ArchiveLoading, ArchiveError } from '../components/ResultsArchive'

// The one roster editor, for an admin or the team's manager (spec:
// docs/superpowers/specs/2026-11-06-team-tracker-design.md). Every write
// goes through api/tournament-history.ts, which decides who may; this page
// only hides what the server would refuse. After a write it reloads the
// team: the server purged the edge cache, so the read is fresh.

const SEARCH_MIN = 3
const SEARCH_DEBOUNCE_MS = 300
const LOGO_TYPES = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif'

// Local calendar date as yyyy-mm-dd (the sv locale formats it that way).
const today = () => new Date().toLocaleDateString('sv')

// Error text for a failed write, with the two server verdicts that need a
// different sentence than the server's own.
function writeError(err) {
  if (err.status === 409 && /disbanded/i.test(err.message)) return 'This team is disbanded; an admin can reinstate it.'
  if (err.status === 403) return err.message || 'Only an admin can change that.'
  return err.message || 'Something went wrong'
}

// Archive player search → pick. Members are keyed by RPH player id, and the
// archive is where those ids come from.
function PlayerPicker({ onPick, disabled }) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState({ q: '', players: [] })
  const q = query.trim()
  const searching = q !== found.q

  useEffect(() => {
    if (q.length < SEARCH_MIN) return
    let cancelled = false
    const t = setTimeout(() => {
      searchTournamentPlayers(q)
        .then((data) => { if (!cancelled) setFound({ q, players: data.players ?? [] }) })
        .catch(() => { if (!cancelled) setFound({ q, players: [] }) })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a player in the archive…"
        aria-label="Find a player"
        disabled={disabled}
        className="w-full"
      />
      {q.length >= SEARCH_MIN && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-sm max-h-64 overflow-y-auto">
          {searching && found.players.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">Searching…</p>
          ) : found.players.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No players match.</p>
          ) : (
            found.players.map((p) => (
              <button
                key={p.playerId}
                type="button"
                onClick={() => { onPick(p); setQuery('') }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-baseline justify-between gap-3"
              >
                <span className="text-sm font-medium text-gray-900">
                  {p.playerName} <span className="text-xs text-gray-400 font-normal">id {p.playerId}</span>
                </span>
                {p.lastSeenEventName && <span className="text-xs text-gray-500 truncate">{p.lastSeenEventName}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Keyed by the member's dates as well as its id, so a reload that changes
// them on the server (a dissolve or reinstate) remounts the row with fresh
// inputs instead of keeping the old values in local state.
function MemberRow({ member, teamId, readOnly, onSaved, onError }) {
  const [joinedOn, setJoinedOn] = useState(member.joinedOn ?? '')
  const [leftOn, setLeftOn] = useState(member.leftOn ?? '')

  async function save(next) {
    try {
      await saveTeamMember({
        id: member.id,
        teamId,
        playerId: member.playerId,
        playerName: member.playerName,
        joinedOn: next.joinedOn || null,
        leftOn: next.leftOn || null,
      })
      onSaved()
    } catch (err) {
      onError(writeError(err))
      setJoinedOn(member.joinedOn ?? '')
      setLeftOn(member.leftOn ?? '')
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${member.playerName}'s membership row? Use a leaving date instead if they left the team.`)) return
    try {
      await deleteTeamMember(member.id)
      onSaved()
    } catch (err) {
      onError(writeError(err))
    }
  }

  const former = Boolean(member.leftOn)
  return (
    <tr className={`block sm:table-row py-1.5 sm:py-0 border-b border-gray-100 ${former ? 'text-gray-500' : ''}`}>
      <td className="block sm:table-cell py-0.5 sm:py-2 pr-4">
        <Link to={`/results/players/${member.playerId}`} className="hover:underline">{member.playerName}</Link>
        <span className="text-xs text-gray-400 ml-2">{member.playerId}</span>
        {former && <Badge tone="neutral" className="ml-2">Former</Badge>}
      </td>
      <td className="block sm:table-cell py-0.5 sm:py-2 pr-4">
        <span className="sm:hidden inline-block w-16 text-xs uppercase tracking-wide text-gray-500">Joined</span>
        <Input
          type="date"
          value={joinedOn}
          disabled={readOnly}
          onChange={(e) => setJoinedOn(e.target.value)}
          onBlur={() => { if ((joinedOn || null) !== member.joinedOn) save({ joinedOn, leftOn }) }}
          className="py-1"
        />
      </td>
      <td className="block sm:table-cell py-0.5 sm:py-2 pr-4">
        <span className="sm:hidden inline-block w-16 text-xs uppercase tracking-wide text-gray-500">Left</span>
        <Input
          type="date"
          value={leftOn}
          disabled={readOnly}
          min={joinedOn || undefined}
          onChange={(e) => setLeftOn(e.target.value)}
          onBlur={() => { if ((leftOn || null) !== member.leftOn) save({ joinedOn, leftOn }) }}
          className="py-1"
        />
      </td>
      <td className="block sm:table-cell py-0.5 sm:py-2 sm:text-right">
        <Button variant="danger" size="sm" onClick={remove} disabled={readOnly}>Delete</Button>
      </td>
    </tr>
  )
}

function DissolveZone({ team, onDone, onError }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  async function dissolve() {
    setBusy(true)
    try {
      await dissolveTeam(team.id)
      onDone()
    } catch (err) {
      onError(writeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-red-200 bg-red-50 rounded-lg p-4 mt-6">
      <h3 className="font-display text-base font-medium uppercase tracking-wide text-red-700 mb-1">Dissolve team</h3>
      <p className="text-sm text-gray-700 mb-3">
        Marks {team.name} disbanded as of today. Every current member becomes a former member, the team stays in the
        directory and on their player pages with its results, and nobody can edit it again. Only an admin can reinstate it.
      </p>
      {!open ? (
        <Button variant="danger" onClick={() => setOpen(true)}>Dissolve {team.name}…</Button>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Type the team name to confirm</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={team.name} />
          </label>
          <Button variant="danger" onClick={dissolve} disabled={busy || typed.trim() !== team.name}>
            {busy ? 'Dissolving…' : 'Dissolve'}
          </Button>
          <Button variant="quiet" onClick={() => { setOpen(false); setTyped('') }}>Cancel</Button>
        </div>
      )}
    </div>
  )
}

export function TeamManagePage() {
  const { slug } = useParams()
  const { user, isLoading } = useSupporter()
  const [access, setAccess] = useState(null) // { admin, canEdit } once my-teams resolves
  const [loaded, setLoaded] = useState(null) // { slug, data } | { slug, error }
  const [form, setForm] = useState(null) // { name, url }
  const [newJoinedOn, setNewJoinedOn] = useState('') // blank = unknown start
  const [status, setStatus] = useState(null) // { kind: 'error' | 'ok', text }
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const reload = useCallback(() => {
    fetchTeam(slug)
      .then((data) => {
        setLoaded({ slug, data })
        setForm({ name: data.team.name, url: data.team.url ?? '' })
      })
      .catch((error) => setLoaded({ slug, error }))
  }, [slug])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (!user) return
    fetchMyTeams()
      .then((my) => setAccess({ admin: my.admin, canEdit: my.admin || my.teams.some((t) => t.slug === slug) }))
      .catch(() => setAccess({ admin: false, canEdit: false }))
  }, [user, slug])

  const data = loaded?.slug === slug ? loaded.data : null
  const error = loaded?.slug === slug ? loaded.error : null

  if (error) return <ArchiveError error={error} notFoundLabel="No team at this address." failedLabel="Couldn't load this team." />
  if (isLoading || !data || (user && !access)) return <div className="w-full px-6 py-8"><ArchiveLoading label="Loading…" /></div>

  if (!user || !access.canEdit) {
    return (
      <div className="w-full px-6 py-8">
        <Card className="p-6 max-w-md">
          <p className="text-gray-900 font-medium mb-2">Only this team's manager or an admin can edit the roster.</p>
          {!user && <p className="text-sm text-gray-500 mb-2"><Link to="/login" className="text-forge-ink hover:underline">Sign in</Link> if that is you.</p>}
          <Link to={`/teams/${slug}`} className="text-sm text-forge-ink hover:underline">← {data.team.name}</Link>
        </Card>
      </div>
    )
  }

  const { team, members } = data
  const disbanded = Boolean(team.disbandedOn)
  const readOnly = disbanded || busy
  const { current, former } = splitRoster(members)
  const ok = (text) => setStatus({ kind: 'ok', text })
  const fail = (text) => setStatus({ kind: 'error', text })

  async function run(label, fn) {
    setBusy(true)
    setStatus(null)
    try {
      await fn()
      ok(label)
      reload()
    } catch (err) {
      fail(writeError(err))
    } finally {
      setBusy(false)
    }
  }

  const saveDetails = (patch = {}) =>
    run('Saved', () => saveTeam({ id: team.id, name: form.name, url: form.url, logoUrl: team.logoUrl, ...patch }))

  async function onLogoChosen(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await run('Logo updated', async () => {
      const logoUrl = await uploadLogo(file)
      await saveTeam({ id: team.id, name: form.name, url: form.url, logoUrl })
    })
  }

  const addMember = (p) =>
    run(`Added ${p.playerName}`, () =>
      saveTeamMember({ teamId: team.id, playerId: p.playerId, playerName: p.playerName, joinedOn: newJoinedOn || null, leftOn: null })
    )

  return (
    <div className="w-full px-6 py-8">
      <Link to={`/teams/${slug}`} className="text-sm text-gray-500 hover:underline">← {team.name}</Link>
      <PageHeader
        title={`Manage ${team.name}`}
        description={disbanded ? null : 'Changes are public immediately.'}
        actions={
          disbanded && access.admin ? (
            <Button variant="primary" disabled={busy} onClick={() => run('Team reinstated', () => reinstateTeam(team.id))}>
              Reinstate team
            </Button>
          ) : null
        }
      />

      {disbanded && (
        <div className="border border-gray-200 border-l-4 border-l-gray-400 bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-700">
          <strong className="text-gray-900">This team was disbanded on {formatEventDate(team.disbandedOn)}</strong> and is read-only.
          Its roster, name, link and logo cannot be changed. An admin can reinstate it, which reopens the memberships the
          dissolution closed.
        </div>
      )}

      {status && (
        <p className={`text-sm mb-4 ${status.kind === 'error' ? 'text-red-700' : 'text-green-700'}`} role="status">{status.text}</p>
      )}

      <Card className={`p-6 ${disbanded ? 'opacity-70' : ''}`}>
        <div className="flex flex-wrap items-start gap-6 mb-2">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Logo</p>
            <TeamLogo name={team.name} logoUrl={team.logoUrl} size="h-16 w-16" muted={disbanded} className="text-xl" />
            <input ref={fileRef} type="file" accept={LOGO_TYPES} className="hidden" onChange={onLogoChosen} />
            <div className="flex gap-2 mt-2">
              <Button variant="quiet" size="sm" disabled={readOnly} onClick={() => fileRef.current?.click()}>
                {team.logoUrl ? 'Replace' : 'Upload'}
              </Button>
              {team.logoUrl && (
                <Button variant="danger" size="sm" disabled={readOnly} onClick={() => saveDetails({ logoUrl: null })}>Remove</Button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP or SVG, up to 2 MB. Square works best.</p>
          </div>
          <form
            className="flex-1 flex flex-wrap items-end gap-3 min-w-64"
            onSubmit={(e) => { e.preventDefault(); saveDetails() }}
          >
            <label className="block flex-1 min-w-48">
              <span className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Name</span>
              <Input value={form.name} disabled={readOnly} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full" />
            </label>
            <label className="block flex-1 min-w-48">
              <span className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Link</span>
              <Input value={form.url} disabled={readOnly} placeholder="https://" onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full" />
            </label>
            <Button type="submit" disabled={readOnly}>Save</Button>
          </form>
        </div>
        <p className="text-xs text-gray-400 mb-6">
          Slug <code className="font-mono">{team.slug}</code> · Manager: {access.admin ? 'set on the admin page' : 'you'} · slug and manager are set by an admin
        </p>

        {!disbanded && (
          <>
            <h3 className="font-display text-base font-medium uppercase tracking-wide text-gray-900 mb-2">Add member</h3>
            <div className="flex flex-wrap items-end gap-3 mb-1">
              <div className="flex-1 min-w-64"><PlayerPicker onPick={addMember} disabled={readOnly} /></div>
              <label className="block">
                <span className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Joined (optional)</span>
                <Input type="date" value={newJoinedOn} max={today()} onChange={(e) => setNewJoinedOn(e.target.value)} disabled={readOnly} />
              </label>
            </div>
            <p className="text-xs text-gray-400 mb-6">
              Players must have appeared in an archived event to be found; that is what ties a member to RPH's player id.
              Leave Joined blank if you don't know it: the member then counts for every archived event. Set it once known and
              earlier events drop off.
            </p>
          </>
        )}

        <h3 className="font-display text-base font-medium uppercase tracking-wide text-gray-900 mb-2">Members</h3>
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">No members yet.</p>
        ) : (
          <table className="w-full text-sm block sm:table">
            <thead className="hidden sm:table-header-group">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-1.5 pr-4">Player</th>
                <th className="py-1.5 pr-4">Joined <span className="normal-case tracking-normal font-normal">(blank = unknown)</span></th>
                <th className="py-1.5 pr-4">Left</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody className="block sm:table-row-group">
              {[...current, ...former].map((m) => (
                <MemberRow key={`${m.id}:${m.joinedOn}:${m.leftOn ?? ''}`} member={m} teamId={team.id} readOnly={readOnly} onSaved={() => { ok('Saved'); reload() }} onError={fail} />
              ))}
            </tbody>
          </table>
        )}
        {!disbanded && (
          <p className="text-xs text-gray-400 mt-2">
            Dates save when you leave the field. A blank Joined date counts the member since before the archive. Clearing a
            leaving date reinstates the member. Delete is for a row added by mistake; a departure gets a leaving date.
          </p>
        )}

        {!disbanded && <DissolveZone team={team} onDone={() => { ok('Team dissolved'); reload() }} onError={fail} />}
      </Card>
    </div>
  )
}

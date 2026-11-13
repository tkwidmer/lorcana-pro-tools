import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchTeam, fetchMyTeams } from '../lib/tournamentHistoryApi'
import { fetchAllRegistrations } from '../lib/tournamentApi'
import { splitRoster, formatMembership } from '../lib/teams'
import { formatEventDate, ordinal } from '../lib/resultsArchive'
import { useSupporter } from '../hooks/useSupporter'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StatCard } from '../components/StatCard'
import { InkIcons } from '../components/InkIcons'
import { TeamLogo } from '../components/TeamLogo'
import { LiveMajorsDetails, LiveMajorsList } from '../components/LiveMajorsList'
import { useLiveMajors } from '../hooks/useLiveMajors'
import { ArchiveFootnote, ArchiveLoading, ArchiveError } from '../components/ResultsArchive'

const INITIAL_EVENTS = 5

// Whether the viewer may edit this team: an admin, or its manager.
function useCanManage(slug) {
  const { user } = useSupporter()
  const [canManage, setCanManage] = useState(false)
  useEffect(() => {
    if (!user) return
    fetchMyTeams()
      .then((my) => setCanManage(my.admin || my.teams.some((t) => t.slug === slug)))
      .catch(() => {})
  }, [user, slug])
  return canManage
}

// How many of the current roster are registered in each live event. One
// registrations crawl per event (50 a page); a DLC is ~16 requests.
// ponytail: fetched on every page view; cache per event id if the list grows past a handful.
function useRegisteredCounts(liveEvents, rosterIds) {
  const [counts, setCounts] = useState({})
  const key = rosterIds.join(',')
  useEffect(() => {
    if (!liveEvents || rosterIds.length === 0) return
    let cancelled = false
    for (const e of liveEvents) {
      fetchAllRegistrations(e.eventId)
        .then((regs) => {
          if (cancelled) return
          const ids = new Set(regs.map((r) => String(r.user?.id)))
          setCounts((prev) => ({ ...prev, [e.eventId]: rosterIds.filter((id) => ids.has(id)).length }))
        })
        .catch(() => {})
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEvents, key])
  return counts
}

function EventResults({ event }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <Link to={`/results/events/${event.eventId}`} className="font-display text-base font-medium uppercase tracking-wide text-gray-900 hover:underline">
          {event.eventName}
        </Link>
        <span className="text-xs text-gray-500">
          {formatEventDate(event.eventDate)}
          {event.startingPlayerCount ? ` · ${event.startingPlayerCount} players` : ''}
          {event.topCutSize ? ` · Top ${event.topCutSize}` : ''}
        </span>
        {event.results[0]?.rank != null && <Badge className="ml-auto">Best {ordinal(event.results[0].rank)}</Badge>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th className="py-1.5 pr-4 text-right w-14">Rank</th>
            <th className="py-1.5 pr-4">Player</th>
            <th className="py-1.5 pr-4">Record</th>
            <th className="py-1.5 pr-4">Inks</th>
            <th className="py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {event.results.map((r) => (
            <tr key={r.playerId} className="border-b border-gray-100">
              <td className="py-1.5 pr-4 text-right tabular-nums">{r.rank ?? '—'}</td>
              <td className="py-1.5 pr-4">
                <Link to={`/results/players/${r.playerId}`} className="hover:underline">{r.playerName}</Link>
                {r.former && <Badge tone="neutral" className="ml-2">Former</Badge>}
              </td>
              <td className="py-1.5 pr-4 tabular-nums">{r.record ?? '—'}</td>
              <td className="py-1.5 pr-4"><InkIcons colors={r.inks ?? []} size={16} /></td>
              <td className="py-1.5">
                {r.madeTopCut ? <Badge>Top cut</Badge> : r.madeDayTwo ? <Badge tone="neutral">Day 2</Badge> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// Remounted per slug so a navigation between teams starts every piece of
// state (team data, registration counts, manage access) fresh.
export function TeamPage() {
  const { slug } = useParams()
  return <TeamPageBody key={slug} slug={slug} />
}

function TeamPageBody({ slug }) {
  const [loaded, setLoaded] = useState(null) // { slug, data } | { slug, error }
  const [showAll, setShowAll] = useState(false)
  const canManage = useCanManage(slug)
  const [liveOpen, setLiveOpen] = useState(false)
  const liveEvents = useLiveMajors(liveOpen)

  useEffect(() => {
    let cancelled = false
    fetchTeam(slug)
      .then((data) => { if (!cancelled) setLoaded({ slug, data }) })
      .catch((error) => { if (!cancelled) setLoaded({ slug, error }) })
    return () => { cancelled = true }
  }, [slug])

  const data = loaded?.slug === slug ? loaded.data : null
  const error = loaded?.slug === slug ? loaded.error : null
  const members = data?.members
  const { current: currentMembers, former: formerMembers } = useMemo(() => splitRoster(members ?? []), [members])
  const rosterIds = useMemo(() => currentMembers.map((m) => String(m.playerId)), [currentMembers])
  const disbanded = Boolean(data?.team.disbandedOn)
  const registered = useRegisteredCounts(disbanded ? null : liveEvents, rosterIds)

  if (error) return <ArchiveError error={error} notFoundLabel="No team at this address." failedLabel="Couldn't load this team." />
  if (!data) return <div className="w-full px-6 py-8"><ArchiveLoading label="Loading team…" /></div>

  const { team, events } = data
  const topCuts = events.reduce((n, e) => n + e.results.filter((r) => r.madeTopCut).length, 0)
  const best = events
    .flatMap((e) => e.results.filter((r) => r.rank != null).map((r) => ({ rank: r.rank, eventName: e.eventName })))
    .sort((a, b) => a.rank - b.rank)[0]
  const playingNow = liveEvents?.find((e) => e.displayStatus === 'inProgress' && registered[e.eventId] > 0)
  const visibleEvents = showAll ? events : events.slice(0, INITIAL_EVENTS)

  return (
    <div className="w-full px-6 py-8">
      <Link to="/teams" className="text-sm text-gray-500 hover:underline">← All teams</Link>
      <div className="flex items-start gap-4 mt-2">
        <TeamLogo name={team.name} logoUrl={team.logoUrl} size="h-16 w-16" muted={disbanded} className="mt-1 text-xl" />
        <div className="flex-1 min-w-0">
          <PageHeader
            title={team.name}
            description={
              <>
                {disbanded
                  ? `${formerMembers.length} former ${formerMembers.length === 1 ? 'member' : 'members'}`
                  : `${currentMembers.length} current ${currentMembers.length === 1 ? 'member' : 'members'}${formerMembers.length ? ` · ${formerMembers.length} former` : ''}`}
                {team.url && (
                  <>
                    {' · '}
                    <a href={team.url} target="_blank" rel="noreferrer" className="hover:underline">{team.url.replace(/^https?:\/\//, '')}</a>
                  </>
                )}
              </>
            }
            actions={
              <>
                {disbanded && <Badge tone="neutral">Disbanded {formatEventDate(team.disbandedOn)}</Badge>}
                {playingNow && <Badge>Playing now · {playingNow.name}</Badge>}
                {canManage && <Button to={`/teams/${slug}/manage`} size="sm">Manage roster</Button>}
              </>
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label={disbanded ? 'Former members' : 'Current members'} value={disbanded ? formerMembers.length : currentMembers.length} size="lg" />
        <StatCard label="Archived events played" value={events.length} size="lg" />
        <StatCard label="Top cuts" value={topCuts} size="lg" />
        <StatCard label="Best finish" value={best ? ordinal(best.rank) : '—'} hint={best?.eventName} size="lg" />
      </div>

      {!disbanded && (
        <LiveMajorsDetails events={liveEvents} onOpen={() => setLiveOpen(true)} className="mb-6">
          <LiveMajorsList
            events={liveEvents}
            renderMeta={(e) => {
              const n = registered[e.eventId]
              if (currentMembers.length === 0) return <span className="text-sm text-gray-500">No current members</span>
              if (n === undefined) return <span className="text-xs text-gray-400">Checking registrations…</span>
              if (n === 0) return <span className="text-sm text-gray-500">None registered yet</span>
              return <span className="text-sm"><strong className="text-gray-900">{n}</strong> of {currentMembers.length} registered</span>
            }}
            renderAction={(e) => (
              <Button
                to={`/tournament-lookup?event=${e.eventId}&tab=team&team=${slug}`}
                size="sm"
                variant={registered[e.eventId] > 0 ? 'secondary' : 'quiet'}
              >
                {registered[e.eventId] > 0 ? 'View team live →' : 'Open in Tournament Lookup →'}
              </Button>
            )}
          />
          <p className="text-xs text-gray-400 mt-3">
            In-progress events and those starting within 14 days, from the Play Hub. Registrations refresh when you reload.
          </p>
        </LiveMajorsDetails>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5" title={disbanded ? 'Former members' : 'Roster'}>
          {disbanded ? (
            <FormerTable members={formerMembers} />
          ) : (
            <>
              {currentMembers.length === 0 ? (
                <p className="text-sm text-gray-500">No current members.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="py-1.5 pr-4">Player</th>
                      <th className="py-1.5">Since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMembers.map((m) => (
                      <tr key={m.id} className="border-b border-gray-100">
                        <td className="py-1.5 pr-4"><Link to={`/results/players/${m.playerId}`} className="hover:underline">{m.playerName}</Link></td>
                        <td className="py-1.5 text-gray-500">{formatMembership(m).replace(/^Since /, '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {formerMembers.length > 0 && (
                <details className="mt-4">
                  <summary className="text-sm text-gray-500 cursor-pointer hover:underline">Former members ({formerMembers.length})</summary>
                  <div className="mt-2"><FormerTable members={formerMembers} /></div>
                </details>
              )}
            </>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {events.length === 0 ? (
            <Card className="p-5"><p className="text-sm text-gray-500">No archived events with a member on the team yet.</p></Card>
          ) : (
            visibleEvents.map((e) => <EventResults key={e.eventId} event={e} />)
          )}
          {!showAll && events.length > INITIAL_EVENTS && (
            <p className="text-sm text-gray-500">
              {events.length - INITIAL_EVENTS} more {events.length - INITIAL_EVENTS === 1 ? 'event' : 'events'} ·{' '}
              <button type="button" onClick={() => setShowAll(true)} className="text-forge-ink hover:underline">Show all</button>
            </p>
          )}
          {disbanded && events.length > 0 && (
            <p className="text-xs text-gray-400">Results stop at the dissolution date: every membership closed that day.</p>
          )}
        </div>
      </div>
      <ArchiveFootnote />
    </div>
  )
}

function FormerTable({ members }) {
  if (members.length === 0) return <p className="text-sm text-gray-500">None.</p>
  return (
    <table className="w-full text-sm">
      <tbody>
        {members.map((m) => (
          <tr key={m.id} className="border-b border-gray-100 text-gray-500">
            <td className="py-1.5 pr-4"><Link to={`/results/players/${m.playerId}`} className="hover:underline">{m.playerName}</Link></td>
            <td className="py-1.5 text-xs">{formatMembership(m)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

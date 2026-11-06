import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchArchivePlayer, fetchArchiveEventPlayer } from '../lib/tournamentHistoryApi'
import { playerSummary, matchOutcome, formatEventDate, ordinal, formatRecord, formatRating } from '../lib/resultsArchive'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { StatCard } from '../components/StatCard'
import { InkIcons } from '../components/InkIcons'
import { ArchiveFootnote, ArchiveLoading, ArchiveError } from '../components/ResultsArchive'

const RESULT_CLASS = { win: 'text-green-700', loss: 'text-red-700', draw: 'text-gray-500', bye: 'text-gray-400' }
const RESULT_LABEL = { win: 'Win', loss: 'Loss', draw: 'Draw', bye: 'Bye' }

// Team Tracker memberships: current teams link to the team, former teams
// (left, or the team disbanded) sit muted with their years.
function TeamBadges({ teams }) {
  const year = (d) => d.slice(0, 4)
  return (
    <span className="flex flex-wrap items-center gap-1.5 mt-2">
      {teams.map((t) => {
        const endedOn = t.leftOn ?? t.disbandedOn
        return endedOn ? (
          <Badge key={`${t.slug}-${t.joinedOn}`} tone="neutral">
            {t.name} · {t.joinedOn ? `${year(t.joinedOn)}–` : 'until '}{year(endedOn)}
          </Badge>
        ) : (
          <Link key={`${t.slug}-${t.joinedOn}`} to={`/teams/${t.slug}`} className="hover:underline">
            <Badge>{t.name}</Badge>
          </Link>
        )
      })}
    </span>
  )
}

// The rating after each rated event, as a line scaled to its own range.
function RatingSparkline({ history }) {
  if (history.length < 2) return null
  const ratings = history.map((h) => h.rating)
  const min = Math.min(...ratings)
  const span = Math.max(...ratings) - min || 1
  const points = ratings.map((r, i) => `${i},${(1 - (r - min) / span) * 20 + 2}`).join(' ')
  return (
    <svg
      viewBox={`0 0 ${ratings.length - 1} 24`}
      preserveAspectRatio="none"
      className="block w-full h-6 mt-1 text-forge"
      role="img"
      aria-label={`Rating over ${history.length} events`}
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function RatingTile({ rating }) {
  if (!rating) return <StatCard size="lg" label="Rating" value="—" hint="No rated matches" />
  return (
    <StatCard
      size="lg"
      label="Rating"
      value={formatRating(rating)}
      hint={
        <>
          {rating.rank ? (
            <Link to="/results/ratings" className="hover:underline">#{rating.rank} in the archive</Link>
          ) : (
            'Provisional'
          )}
          <RatingSparkline history={rating.history} />
        </>
      }
    />
  )
}

function EventRounds({ eventId, playerId }) {
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    fetchArchiveEventPlayer(eventId, playerId)
      .then((d) => setMatches(d.matches))
      .catch((e) => setError(e.message))
  }, [eventId, playerId])
  if (error) return <p className="text-xs text-red-700 py-2">{error}</p>
  if (!matches) {
    return (
      <div className="py-2">
        <ArchiveLoading label="Loading rounds…" />
      </div>
    )
  }
  if (matches.length === 0) return <p className="text-xs text-gray-500 py-2">No match data for this event.</p>
  return (
    <table className="w-full text-xs my-2">
      <tbody>
        {matches.map((m) => {
          const o = matchOutcome(m, playerId)
          return (
            <tr key={`${m.phaseName}-${m.roundNumber}-${m.tableNumber}`}>
              <td className="py-1 pr-3 text-gray-500 whitespace-nowrap">
                {m.phaseName ? `${m.phaseName} · ` : ''}R{m.roundNumber}
              </td>
              <td className="py-1 pr-3">
                {o.opponent ? (
                  <Link to={`/results/players/${o.opponent.id}`} className="hover:underline">
                    {o.opponent.name ?? o.opponent.id}
                  </Link>
                ) : (
                  '—'
                )}
              </td>
              <td className={`py-1 pr-3 font-medium ${RESULT_CLASS[o.result]}`}>{RESULT_LABEL[o.result]}</td>
              <td className="py-1 tabular-nums text-gray-500">{o.score ?? ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// Keyed on the id so following an opponent link starts from fresh state.
export function ResultsPlayerPage() {
  const { playerId } = useParams()
  return <PlayerView key={playerId} playerId={playerId} />
}

function PlayerView({ playerId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null) // eventId whose rounds are expanded

  useEffect(() => {
    fetchArchivePlayer(playerId).then(setData).catch(setError)
  }, [playerId])

  const summary = useMemo(
    () => data && playerSummary({ events: data.events, matches: data.matches, playerId }),
    [data, playerId]
  )

  if (error) return <ArchiveError error={error} notFoundLabel="Player not found" failedLabel="Could not load this player" />
  if (!data) {
    return (
      <div className="w-full px-6 py-8">
        <ArchiveLoading />
      </div>
    )
  }

  const { record, bestFinish, rivals, inkPairs } = summary
  // Inks are unknown (null) until a source fills them; hide the column until one does.
  const hasInks = inkPairs.length > 0
  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title={data.playerName}
        description={
          <>
            Across {summary.eventsPlayed} imported {summary.eventsPlayed === 1 ? 'event' : 'events'}
            {data.teams?.length > 0 && <TeamBadges teams={data.teams} />}
          </>
        }
      />
      <Link to="/results" className="text-sm text-gray-500 hover:underline">← All results</Link>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 my-6">
        <RatingTile rating={data.rating} />
        <StatCard size="lg" label="Events played" value={summary.eventsPlayed} />
        <StatCard size="lg" label="Top cuts" value={summary.topCuts} />
        <StatCard
          size="lg"
          label="Best finish"
          value={
            bestFinish ? (
              <Link to={`/results/events/${bestFinish.eventId}`} className="hover:underline">
                {ordinal(bestFinish.rank)} of {bestFinish.startingPlayerCount?.toLocaleString() ?? '?'}
              </Link>
            ) : (
              '—'
            )
          }
          hint={bestFinish?.eventName}
        />
        <StatCard size="lg" label="Match record" value={formatRecord(record)} />
      </div>

      {hasInks && (
        <Card title="Decks played" className="p-4 mb-6">
          <table className="w-full text-sm">
            <tbody>
              {inkPairs.map((p) => (
                <tr key={p.inks.join('/')} className="border-b border-gray-100">
                  <td className="py-1.5 pr-4">
                    <span className="inline-flex items-center gap-2">
                      <InkIcons colors={p.inks} size={18} />
                      <span className="font-medium text-gray-900 capitalize">{p.inks.join(' / ')}</span>
                    </span>
                  </td>
                  <td className="py-1.5 pr-4 text-gray-500">
                    {p.events} {p.events === 1 ? 'event' : 'events'}
                    {p.topCuts > 0 && ` · ${p.topCuts} top ${p.topCuts === 1 ? 'cut' : 'cuts'}`}
                  </td>
                  <td className="py-1.5 tabular-nums">{formatRecord(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Events" className="p-4 mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Event</th>
                {hasInks && <th className="py-2 pr-4">Inks</th>}
                <th className="py-2 pr-4">Finish</th>
                <th className="py-2 pr-4">Record</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <Fragment key={e.eventId}>
                  <tr
                    className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                    onClick={() => setOpen(open === e.eventId ? null : e.eventId)}
                    aria-expanded={open === e.eventId}
                  >
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-500">{formatEventDate(e.eventDate)}</td>
                    <td className="py-2 pr-4">
                      <Link
                        to={`/results/events/${e.eventId}`}
                        onClick={(ev) => ev.stopPropagation()}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {e.eventName}
                      </Link>
                    </td>
                    {hasInks && (
                      <td className="py-2 pr-4">
                        <InkIcons colors={e.inks ?? []} size={16} emptyFallback={<span className="text-gray-400">—</span>} />
                      </td>
                    )}
                    <td className="py-2 pr-4 tabular-nums">
                      {e.rank != null ? `#${e.rank}` : '—'}
                      {e.startingPlayerCount ? ` of ${e.startingPlayerCount}` : ''}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{e.record ?? '—'}</td>
                    <td className="py-2">{e.madeTopCut && <Badge>Top cut</Badge>}</td>
                  </tr>
                  {open === e.eventId && (
                    <tr>
                      <td colSpan={hasInks ? 6 : 5} className="bg-gray-50 px-3">
                        <EventRounds eventId={e.eventId} playerId={playerId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Most-faced opponents" className="p-4">
        {rivals.length === 0 ? (
          <p className="text-sm text-gray-500">No matches recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {rivals.map((r) => (
                <tr key={r.playerId} className="border-b border-gray-100">
                  <td className="py-1.5 pr-4">
                    <Link to={`/results/players/${r.playerId}`} className="font-medium text-gray-900 hover:underline">
                      {r.playerName ?? r.playerId}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4 text-gray-500">
                    {r.meetings} {r.meetings === 1 ? 'meeting' : 'meetings'}
                  </td>
                  <td className="py-1.5 tabular-nums">{formatRecord(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <ArchiveFootnote />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTeams } from '../lib/tournamentHistoryApi'
import { formatEventDate, ordinal } from '../lib/resultsArchive'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { TeamLogo } from '../components/TeamLogo'
import { ArchiveFootnote, ArchiveLoading } from '../components/ResultsArchive'

function monthYear(yyyyMmDd) {
  return new Date(`${yyyyMmDd}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function TeamRows({ teams, muted = false }) {
  return teams.map((t) => (
    <tr key={t.slug} className={`border-b border-gray-100 ${muted ? 'text-gray-500' : ''}`}>
      <td className="py-2 pr-4">
        <Link to={`/teams/${t.slug}`} className="inline-flex items-center gap-3 font-medium hover:underline">
          <TeamLogo name={t.name} logoUrl={t.logoUrl} muted={muted} />
          <span className={muted ? '' : 'text-gray-900'}>{t.name}</span>
        </Link>
        {t.disbandedOn && (
          <Badge tone="neutral" className="ml-2">
            Disbanded {monthYear(t.disbandedOn)}
          </Badge>
        )}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">
        {t.memberCount}
        {muted && t.formerCount > 0 && <span className="text-xs text-gray-400"> · {t.formerCount} former</span>}
      </td>
      <td className="py-2 pr-4">
        {t.lastEvent ? (
          <Link to={`/results/events/${t.lastEvent.eventId}`} className="hover:underline">
            {t.lastEvent.eventName}
          </Link>
        ) : (
          <span className="text-gray-400">No archived events yet</span>
        )}
      </td>
      <td className="py-2 pr-4 whitespace-nowrap text-gray-500">{t.lastEvent ? formatEventDate(t.lastEvent.eventDate) : ''}</td>
      <td className="py-2 text-right tabular-nums">{t.lastEvent?.bestRank != null ? ordinal(t.lastEvent.bestRank) : '—'}</td>
    </tr>
  ))
}

export function TeamsPage() {
  const [teams, setTeams] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchTeams()
      .then((data) => setTeams(data.teams))
      .catch((err) => setError(err.message || 'Failed to load teams'))
  }, [])

  const active = teams?.filter((t) => !t.disbandedOn) ?? []
  const former = teams?.filter((t) => t.disbandedOn) ?? []

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Team Tracker"
        description="Every team's current roster and how it finished at the majors in the Tournament History archive."
      />
      <Card className="p-6">
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : teams === null ? (
          <ArchiveLoading />
        ) : teams.length === 0 ? (
          <p className="text-sm text-gray-500">No teams yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4">Team</th>
                  <th className="py-2 pr-4 text-right">Members</th>
                  <th className="py-2 pr-4">Last major</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 text-right">Best finish</th>
                </tr>
              </thead>
              <tbody>
                <TeamRows teams={active} />
                {former.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={5} className="pt-6 pb-1 text-xs uppercase tracking-wide text-gray-400 font-semibold">
                        Former teams
                      </td>
                    </tr>
                    <TeamRows teams={former} muted />
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-gray-400 mt-4">
        Teams are curated by the site and kept current by their managers. Missing yours, or a roster out of date? Tell us.
      </p>
      <ArchiveFootnote />
    </div>
  )
}

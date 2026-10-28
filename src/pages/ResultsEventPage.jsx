import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchArchiveEvent } from '../lib/tournamentHistoryApi'
import { toBracketMatch, formatEventDate } from '../lib/resultsArchive'
import { EliminationBracket } from '../components/EliminationBracket'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Field'
import { Tabs, Tab } from '../components/ui/Tabs'
import { ArchiveFootnote, ArchiveLoading, ArchiveError } from '../components/ResultsArchive'

function eventSummaryLine(event) {
  return [
    event.eventDate && formatEventDate(event.eventDate),
    event.storeName,
    event.gameplayFormat,
    event.startingPlayerCount != null && `${event.startingPlayerCount} players`,
    event.totalSwissRounds > 0 && `${event.totalSwissRounds} Swiss rounds`,
    event.topCutSize && `Top ${event.topCutSize}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

// Keyed on the id so navigating between events starts from fresh state.
export function ResultsEventPage() {
  const { eventId } = useParams()
  return <EventView key={eventId} eventId={eventId} />
}

function EventView({ eventId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('standings')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    fetchArchiveEvent(eventId).then(setData).catch(setError)
  }, [eventId])

  const standings = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const rows = data?.standings ?? []
    return q ? rows.filter((s) => (s.playerName ?? '').toLowerCase().includes(q)) : rows
  }, [data, filter])

  if (error) return <ArchiveError error={error} notFoundLabel="Event not found" failedLabel="Could not load this event" />
  if (!data) {
    return (
      <div className="w-full px-6 py-8">
        <ArchiveLoading />
      </div>
    )
  }

  const { event, bracket } = data
  const hasBracket = bracket.length > 0

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title={event.eventName}
        description={eventSummaryLine(event)}
        actions={
          event.eventUrl && (
            <Button variant="quiet" href={event.eventUrl} target="_blank" rel="noopener noreferrer">
              View on Play Hub
            </Button>
          )
        }
      />
      <Link to="/results" className="text-sm text-gray-500 hover:underline">← All results</Link>

      <Tabs className="mt-4 mb-4">
        <Tab active={tab === 'standings'} onClick={() => setTab('standings')}>Standings</Tab>
        {hasBracket && <Tab active={tab === 'bracket'} onClick={() => setTab('bracket')}>Bracket</Tab>}
      </Tabs>

      {tab === 'bracket' && hasBracket ? (
        <Card className="p-4">
          <EliminationBracket allMatches={bracket.map(toBracketMatch)} phaseName={bracket[0].phaseName} />
        </Card>
      ) : (
        <Card className="p-4">
          <div className="max-w-xs mb-4">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name…"
              aria-label="Filter standings by name"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 text-right">Rank</th>
                  <th className="py-2 pr-4">Player</th>
                  <th className="py-2 pr-4">Record</th>
                  <th className="py-2 pr-4 text-right">Points</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => (
                  <tr key={s.playerId} className="border-b border-gray-100">
                    <td className="py-1.5 pr-4 text-right tabular-nums text-gray-500">{s.rank ?? '—'}</td>
                    <td className="py-1.5 pr-4">
                      <Link to={`/results/players/${s.playerId}`} className="font-medium text-gray-900 hover:underline">
                        {s.playerName}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-4 tabular-nums">{s.record ?? '—'}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{s.matchPoints ?? '—'}</td>
                    <td className="py-1.5">{s.madeTopCut && <Badge>Top cut</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {standings.length === 0 && <p className="text-sm text-gray-500 py-4">No players match.</p>}
        </Card>
      )}
      <ArchiveFootnote />
    </div>
  )
}

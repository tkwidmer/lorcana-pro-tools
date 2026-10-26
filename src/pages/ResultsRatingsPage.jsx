import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchRatings } from '../lib/tournamentHistoryApi'
import { formatEventDate, formatRating, formatRecord, ratingDelta } from '../lib/resultsArchive'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { ArchiveFootnote, ArchiveLoading } from '../components/ResultsArchive'

function deltaClass(delta) {
  if (delta == null || Math.round(delta) === 0) return 'text-gray-500'
  return delta > 0 ? 'text-green-700' : 'text-red-700'
}

export function ResultsRatingsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchRatings().then(setData).catch((e) => setError(e.message))
  }, [])

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Player Ratings"
        description="The strongest players in the Tournament History archive, by Glicko rating."
      />
      <Link to="/results" className="text-sm text-gray-500 hover:underline">← All results</Link>

      <p className="text-sm text-gray-500 my-6 max-w-3xl">
        Glicko rating over imported majors and side events; a player is ranked once their rating deviation is 100 or
        under, which takes about two events.
      </p>

      <Card className="p-4">
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : data === null ? (
          <ArchiveLoading />
        ) : data.players.length === 0 ? (
          <p className="text-sm text-gray-500">No ranked players yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 text-right">#</th>
                  <th className="py-2 pr-4">Player</th>
                  <th className="py-2 pr-4 text-right">Rating</th>
                  <th className="py-2 pr-4 text-right">Matches</th>
                  <th className="py-2 pr-4">Record</th>
                  <th className="py-2 pr-4">Last event</th>
                  <th className="py-2 text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => (
                  <tr key={p.playerId} className="border-b border-gray-100">
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-500">{p.rank}</td>
                    <td className="py-2 pr-4">
                      <Link to={`/results/players/${p.playerId}`} className="font-medium text-gray-900 hover:underline">
                        {p.playerName ?? p.playerId}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap font-medium text-gray-900">{formatRating(p)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{p.matches}</td>
                    <td className="py-2 pr-4 tabular-nums">{formatRecord(p)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-500">{formatEventDate(p.lastEventDate)}</td>
                    <td className={`py-2 text-right tabular-nums ${deltaClass(p.delta)}`}>{ratingDelta(p.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data?.updatedAt && (
        <p className="text-xs text-gray-400 mt-3">
          Updated {formatEventDate(data.updatedAt.slice(0, 10))}. Unreported matches are left out, not counted as losses.
        </p>
      )}
      <ArchiveFootnote />
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getGame } from '../lib/scoutedGames'
import { GameView } from '../components/GameView'

export function ScoutedGamePage() {
  const { uuid } = useParams()
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getGame(uuid).then(r => {
      setRecord(r)
      setLoading(false)
    })
  }, [uuid])

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-4">
        <Link to="/library?tab=history" className="text-xs text-gray-500 hover:text-gray-900">
          ← Back to history
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : !record ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-sm mb-2">Game not found.</div>
          <Link to="/library?tab=history" className="text-sm text-blue-600 hover:underline">
            Back to history →
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-2">
            <h1 className="text-xl font-bold text-gray-900">
              <Link to={`/players/${encodeURIComponent(record.game.p1Name)}`} className="hover:underline">
                {record.game.p1Name}
              </Link>
              <span className="text-gray-400 mx-2">vs</span>
              <Link to={`/players/${encodeURIComponent(record.game.p2Name)}`} className="hover:underline">
                {record.game.p2Name}
              </Link>
            </h1>
            <div className="text-xs text-gray-500 mt-1">
              Last updated {new Date(record.lastUpdated).toLocaleString()} · UUID {uuid}
            </div>
          </div>
          <GameView game={record.game} lastUpdated={new Date(record.lastUpdated)} uuid={uuid} />
        </>
      )}
    </div>
  )
}

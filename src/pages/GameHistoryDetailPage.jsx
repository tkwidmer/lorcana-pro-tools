import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getGame } from '../lib/gameHistory'
import { GameView } from '../components/GameView'

export function GameHistoryDetailPage() {
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
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-4">
        <Link to="/game-history" className="text-xs text-gray-500 hover:text-gray-900">
          ← Back to history
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : !record ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-sm mb-2">Game not found.</div>
          <Link to="/game-history" className="text-sm text-blue-600 hover:underline">
            Back to history →
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-2">
            <h1 className="text-xl font-bold text-gray-900">
              {record.game.p1Name} vs {record.game.p2Name}
            </h1>
            <div className="text-xs text-gray-500 mt-1">
              Last updated {new Date(record.lastUpdated).toLocaleString()} · UUID {uuid}
            </div>
          </div>
          <GameView game={record.game} lastUpdated={new Date(record.lastUpdated)} />
        </>
      )}
    </div>
  )
}

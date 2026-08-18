import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getAllGames } from '../lib/scoutedGames'
import { getAllGamelogs } from '../lib/gamelogHistory'
import { buildPlayerProfile } from '../lib/playerProfiles'
import { PlayerProfileDetail } from '../components/PlayerProfileDetail'

export function PlayerProfilePage() {
  const { name } = useParams()
  const decodedName = decodeURIComponent(name)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getAllGames(), getAllGamelogs()]).then(([records, gamelogs]) => {
      setProfile(buildPlayerProfile(records, gamelogs, decodedName))
      setLoading(false)
    })
  }, [decodedName])

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-4">
        <Link to="/library?tab=players" className="text-xs text-gray-500 hover:text-gray-900">← All players</Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : !profile ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-sm mb-2">No games found for "{decodedName}".</div>
          <Link to="/library?tab=players" className="text-sm text-blue-600 hover:underline">All players →</Link>
        </div>
      ) : (
        <PlayerProfileDetail profile={profile} />
      )}
    </div>
  )
}

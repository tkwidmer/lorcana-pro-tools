import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAllGames } from '../lib/gameHistory'
import { listPlayers } from '../lib/playerProfiles'
import { resolveColors } from '../lib/inkColors'

function InkStack({ deckKey }) {
  const colors = resolveColors(deckKey.split('+'))
  if (!colors.length) return <span className="text-xs text-gray-400">?</span>
  return (
    <div className="flex gap-0.5">
      {colors.map(c => (
        <img key={c} src={`/ink/${c}.png`} alt={c} className="w-3 h-3" title={c} />
      ))}
    </div>
  )
}

export function PlayersPage() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllGames().then(records => {
      setPlayers(listPlayers(records))
      setLoading(false)
    })
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Players</h1>
        <p className="text-sm text-gray-500 mt-1">
          Aggregate stats and inferred decklists for every player you've spectated.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : players.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg text-gray-500">
          <div className="text-sm mb-2">No players yet.</div>
          <Link to="/game-scraper" className="text-sm text-blue-600 hover:underline">Scrape a game →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {players.map(p => (
            <Link
              key={p.name}
              to={`/players/${encodeURIComponent(p.name)}`}
              className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-900 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{p.name}</div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                  <span>{p.games} game{p.games !== 1 ? 's' : ''}</span>
                  {p.winRate != null && (
                    <span>{p.wins}–{p.losses} ({Math.round(p.winRate * 100)}%)</span>
                  )}
                  <span>{p.deckCount} deck{p.deckCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end max-w-[160px]">
                {p.deckKeys.slice(0, 4).map(k => <InkStack key={k} deckKey={k} />)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

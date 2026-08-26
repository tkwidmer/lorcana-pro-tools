import { useEffect, useState } from 'react'
import { fetchPlayerTournamentHistory, fetchHeadToHead } from '../lib/tournamentHistoryApi'
import { PlayerMatchHistory } from './PlayerMatchHistory'

// Player-shaped stub so PlayerMatchHistory (built for a standings-entry
// shape) can render this event's history for either side of a clicked
// pairing, even when only {id, name} is known from the match relationship.
function toStubPlayer({ id, name }) {
  return {
    player: { id, best_identifier: name },
    user_event_status: { best_identifier: name },
    rank: null,
    record: null,
    match_points: null,
  }
}

function TopCutList({ events }) {
  const cuts = events.filter((e) => e.madeTopCut)
  if (cuts.length === 0) return <p className="text-xs text-gray-400">No top cuts recorded.</p>
  return (
    <ul className="space-y-1">
      {cuts.map((e) => (
        <li key={e.eventId} className="text-xs text-gray-700">
          <span className="font-medium text-gray-900">Rank #{e.rank}</span> of {e.topCutSize} cut — {e.eventName}
        </li>
      ))}
    </ul>
  )
}

function PlayerHistoryColumn({ label, playerStub, history, loading, error, allMatches, structure }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900">{label}</h3>

      <div className="border border-gray-200 rounded-lg p-3 bg-white">
        {loading ? (
          <p className="text-xs text-gray-400">Loading cross-event history…</p>
        ) : error ? (
          <p className="text-xs text-red-500">History unavailable.</p>
        ) : (
          <>
            <div className="flex gap-4 mb-2">
              <div>
                <div className="text-lg font-bold text-gray-900">{history.eventsPlayed}</div>
                <div className="text-xs text-gray-500">Majors played</div>
              </div>
              <div>
                <div className="text-lg font-bold text-gray-900">{history.topCutCount}</div>
                <div className="text-xs text-gray-500">Top cuts</div>
              </div>
            </div>
            <TopCutList events={history.events} />
          </>
        )}
      </div>

      <PlayerMatchHistory
        player={playerStub}
        allMatches={allMatches}
        matchesLoading={false}
        structure={structure}
      />
    </div>
  )
}

export function PairingHistoryPanel({ pairing, onClose, allMatches, structure }) {
  const { p1, p2 } = pairing
  const [historyA, setHistoryA] = useState(null)
  const [historyB, setHistoryB] = useState(null)
  const [headToHead, setHeadToHead] = useState(null)
  const [errorA, setErrorA] = useState(false)
  const [errorB, setErrorB] = useState(false)
  const [errorH2H, setErrorH2H] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetchPlayerTournamentHistory(p1.id)
      .then((data) => { if (!cancelled) setHistoryA(data) })
      .catch(() => { if (!cancelled) setErrorA(true) })

    fetchPlayerTournamentHistory(p2.id)
      .then((data) => { if (!cancelled) setHistoryB(data) })
      .catch(() => { if (!cancelled) setErrorB(true) })

    fetchHeadToHead(p1.id, p2.id)
      .then((data) => { if (!cancelled) setHeadToHead(data) })
      .catch(() => { if (!cancelled) setErrorH2H(true) })

    return () => { cancelled = true }
  }, [p1.id, p2.id])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-xl border border-gray-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">{p1.name} vs {p2.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* Head-to-head banner */}
          {errorH2H ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
              History unavailable.
            </div>
          ) : !headToHead ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-400">
              Checking head-to-head record…
            </div>
          ) : headToHead.matches.length === 0 ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-800">
              First meeting — no prior matches found in imported majors.
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-bold text-amber-900 mb-2">
                Met {headToHead.matches.length}x previously — {p1.name} {headToHead.metRecord.playerAWins}-{headToHead.metRecord.playerBWins}
                {headToHead.metRecord.draws > 0 ? `-${headToHead.metRecord.draws}` : ''} {p2.name}
              </p>
              <ul className="space-y-1">
                {headToHead.matches.map((m, i) => (
                  <li key={i} className="text-xs text-amber-800">
                    <span className="font-medium">{m.eventName}</span> · Round {m.roundNumber} —{' '}
                    {m.isDraw ? 'Draw' : String(m.winnerId) === String(p1.id) ? `${p1.name} won` : `${p2.name} won`}
                    {!m.isDraw && m.gamesWonByWinner != null && ` (${m.gamesWonByWinner}-${m.gamesWonByLoser})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PlayerHistoryColumn
              label={p1.name}
              playerStub={toStubPlayer(p1)}
              history={historyA}
              loading={!historyA && !errorA}
              error={errorA}
              allMatches={allMatches}
              structure={structure}
            />
            <PlayerHistoryColumn
              label={p2.name}
              playerStub={toStubPlayer(p2)}
              history={historyB}
              loading={!historyB && !errorB}
              error={errorB}
              allMatches={allMatches}
              structure={structure}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

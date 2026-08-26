import { useMemo } from 'react'

// RPH's match data has no explicit "advances to" link between rounds — the
// bracket is reconstructed purely from round_number + table_number, sorted
// within each round. That matches the standard seeded-bracket convention
// (table order = bracket slot) that RPH's own elimination pairings follow.
function roundLabel(matchCount, roundNum, phaseName) {
  switch (matchCount) {
    case 1: return 'Final'
    case 2: return 'Semifinals'
    case 4: return 'Quarterfinals'
    case 8: return 'Round of 16'
    case 16: return 'Round of 32'
    case 32: return 'Round of 64'
    default: return `${phaseName ?? 'Bracket'} · Round ${roundNum}`
  }
}

function BracketMatch({ match, onSelectPairing }) {
  const [p1, p2] = [...match.player_match_relationships].sort((a, b) => a.player_order - b.player_order)
  const isBye = match.match_is_bye
  const isDraw = match.match_is_intentional_draw || match.match_is_unintentional_draw
  const p1Won = match.winning_player === p1?.player.id
  const p2Won = match.winning_player === p2?.player.id
  const inProgress = !isBye && !isDraw && (match.status !== 'COMPLETE' || match.winning_player == null)
  const clickable = !isBye && p1 && p2 && Boolean(onSelectPairing)

  return (
    <div
      onClick={
        clickable
          ? () =>
              onSelectPairing({
                p1: { id: p1.player.id, name: p1.user_event_status.best_identifier },
                p2: { id: p2.player.id, name: p2.user_event_status.best_identifier },
              })
          : undefined
      }
      className={`border border-gray-200 rounded-lg bg-white text-xs overflow-hidden w-48 shrink-0 ${
        clickable ? 'cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all' : ''
      }`}
    >
      <div className={`px-2.5 py-1.5 flex items-center justify-between gap-2 ${p1Won ? 'bg-green-50' : ''}`}>
        <span className={`font-medium truncate ${p1Won ? 'text-green-700' : isDraw ? 'text-gray-700' : 'text-gray-500'}`}>
          {p1?.user_event_status.best_identifier ?? '—'}
        </span>
        {!isBye && match.games_won_by_winner != null && (
          <span className="font-mono text-gray-400 shrink-0">{p1Won ? match.games_won_by_winner : match.games_won_by_loser}</span>
        )}
      </div>
      <div className={`px-2.5 py-1.5 flex items-center justify-between gap-2 border-t border-gray-100 ${p2Won ? 'bg-green-50' : ''}`}>
        <span className={`font-medium truncate ${p2Won ? 'text-green-700' : isDraw ? 'text-gray-700' : 'text-gray-500'}`}>
          {isBye ? 'BYE' : p2?.user_event_status.best_identifier ?? '—'}
        </span>
        {!isBye && match.games_won_by_loser != null && (
          <span className="font-mono text-gray-400 shrink-0">{p2Won ? match.games_won_by_winner : match.games_won_by_loser}</span>
        )}
      </div>
      {inProgress && (
        <div className="px-2.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-semibold text-center">In Progress</div>
      )}
    </div>
  )
}

// Renders the RANKED_SINGLE_ELIMINATION phase of an event as a left-to-right
// bracket instead of a flat matches list. Clicking a completed pairing opens
// the same PairingHistoryPanel as the Matches tab (via onSelectPairing).
export function EliminationBracket({ allMatches, phaseName, onSelectPairing }) {
  const rounds = useMemo(() => {
    const bracketMatches = (allMatches ?? []).filter((m) => m.phase_name === phaseName)
    const roundNumbers = [...new Set(bracketMatches.map((m) => m.round_number))].sort((a, b) => a - b)
    return roundNumbers.map((roundNum) => {
      const roundMatches = bracketMatches
        .filter((m) => m.round_number === roundNum)
        .sort((a, b) => (a.table_number ?? 0) - (b.table_number ?? 0))
      return { roundNum, matches: roundMatches }
    })
  }, [allMatches, phaseName])

  if (rounds.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">Bracket hasn't started yet.</p>
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-8 min-w-max px-1 py-2">
        {rounds.map(({ roundNum, matches }, roundIndex) => (
          <div key={roundNum} className="flex flex-col w-48 shrink-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 text-center">
              {roundLabel(matches.length, roundNum, phaseName)}
            </p>
            <div className="flex-1 flex flex-col justify-around gap-4">
              {matches.map((match) => (
                // flexGrow doubles each round so paired matches from the
                // previous round line up roughly midway with their successor
                // — the classic bracket "funnel" without needing explicit
                // connector lines between columns.
                <div key={match.id} style={{ flexGrow: 2 ** roundIndex }} className="flex items-center">
                  <BracketMatch match={match} onSelectPairing={onSelectPairing} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { VALID_INKS } from '../lib/inkColors'
import { generateShareImage } from '../lib/tournamentShareImage'
import { ShareCardModal } from './ShareCardModal'

const ANNOTATIONS_KEY = 'lorcana_tournament_match_annotations'

function getAnnotations() {
  try { return JSON.parse(localStorage.getItem(ANNOTATIONS_KEY) ?? '{}') } catch { return {} }
}

function saveAnnotation(matchId, patch) {
  const all = getAnnotations()
  all[String(matchId)] = { ...all[String(matchId)], ...patch }
  localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(all))
}

function ColorPicker({ selected, onChange }) {
  function toggle(color) {
    const next = selected.includes(color)
      ? selected.filter(c => c !== color)
      : selected.length >= 2 ? [selected[1], color] : [...selected, color]
    onChange(next)
  }
  return (
    <div className="flex gap-1">
      {VALID_INKS.map(color => (
        <button
          key={color}
          title={color.charAt(0).toUpperCase() + color.slice(1)}
          onClick={() => toggle(color)}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
            selected.includes(color) ? 'border-blue-500 scale-110 bg-blue-50' : 'border-transparent opacity-40 hover:opacity-70'
          }`}
        >
          <img src={`/ink/${color}.png`} alt={color} className="w-4 h-4" />
        </button>
      ))}
    </div>
  )
}

function matchResultForPlayer(match, playerId) {
  if (match.match_is_bye) return { result: 'BYE', score: '', opponent: 'BYE' }
  if (match.match_is_intentional_draw || match.match_is_unintentional_draw) {
    const opp = match.player_match_relationships.find((r) => r.player.id !== playerId)
    return { result: 'DRAW', score: '—', opponent: opp?.user_event_status.best_identifier ?? '—' }
  }
  const opp = match.player_match_relationships.find((r) => r.player.id !== playerId)
  const oppName = opp?.user_event_status.best_identifier ?? '—'
  // A round can be reported to the app before every match in it has a
  // winner — an unfinished match has no winning_player yet, which must not
  // be read as a loss.
  if (match.status !== 'COMPLETE' || match.winning_player == null) {
    return { result: 'IN PROGRESS', score: '—', opponent: oppName }
  }
  const won = match.winning_player === playerId
  const w = match.games_won_by_winner
  const l = match.games_won_by_loser
  const score = won ? `${w}-${l}` : `${l}-${w}`
  return { result: won ? 'WIN' : 'LOSS', score, opponent: oppName }
}

// Round-by-round match history for one player within a single loaded
// tournament event. Used by TournamentLookupPage's player detail view, and
// reused by PairingHistoryPanel for either side of a clicked pairing
// alongside that panel's new cross-event/head-to-head data.
export function PlayerMatchHistory({ player, allMatches, matchesLoading, structure, compact = false }) {
  const playerId = player?.player?.id
  const [annotations, setAnnotations] = useState(getAnnotations)
  const [shareCard, setShareCard] = useState(null) // { canvas, imageUrl, filename } | null

  function updateAnnotation(matchId, patch) {
    saveAnnotation(matchId, patch)
    setAnnotations(getAnnotations())
  }

  if (matchesLoading && !allMatches) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Match History</h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      </div>
    )
  }

  const playerMatches = (allMatches ?? []).filter((m) => m.players.includes(playerId))
  if (playerMatches.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Match History</h3>
        <p className="text-sm text-gray-500">
          No completed match data available for this player yet. The share card becomes available once at least one match result loads.
        </p>
      </div>
    )
  }

  // Derive overall stats from matches
  const wins   = playerMatches.filter(m => !m.match_is_bye && m.winning_player === playerId).length
  const losses = playerMatches.filter(m => !m.match_is_bye && m.status === 'COMPLETE' && m.winning_player !== playerId && !m.match_is_intentional_draw && !m.match_is_unintentional_draw).length
  const draws  = playerMatches.filter(m => m.match_is_intentional_draw || m.match_is_unintentional_draw).length
  const played = wins + losses + draws
  const winPct = played > 0 ? ((wins / played) * 100).toFixed(1) : '0.0'

  async function handleShare() {
    const rows = playerMatches.map(m => {
      const { result, score, opponent } = matchResultForPlayer(m, playerId)
      const ann = annotations[String(m.id)] ?? {}
      return {
        round:     m.round_number,
        result,
        score,
        opponent,
        oppColors: ann.oppColors ?? [],
        onPlay:    ann.onPlay ?? null,
      }
    })

    const canvas = await generateShareImage({
      playerName:   player?.user_event_status?.best_identifier ?? '—',
      rank:         player?.rank ?? null,
      totalPlayers: null,
      record:       player?.record ?? `${wins}-${losses}-${draws}`,
      matchPoints:  player?.match_points ?? wins * 3 + draws,
      winPct,
      eventName:    structure?.eventName ?? null,
      rows,
    })

    const name = (player?.user_event_status?.best_identifier ?? 'player').replace(/\s+/g, '-').toLowerCase()
    setShareCard({ canvas, imageUrl: canvas.toDataURL('image/jpeg', 0.95), filename: `${name}-tournament.jpg` })
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Match History</h3>
        {!compact && (
          <button
            onClick={handleShare}
            className="px-3 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Share card
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${compact ? '' : 'min-w-[600px]'}`}>
          <thead className="text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 w-16">Round</th>
              <th className="text-left px-4 py-2">Opponent</th>
              <th className="text-center px-4 py-2 w-16">Result</th>
              <th className="text-center px-4 py-2 w-14">Score</th>
              {!compact && (
                <>
                  <th className="text-left px-4 py-2">Opp Colors</th>
                  <th className="text-center px-4 py-2 w-24">Play/Draw</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {playerMatches.map((match) => {
              const { result, score, opponent } = matchResultForPlayer(match, playerId)
              const ann = annotations[String(match.id)] ?? {}
              const oppColors = ann.oppColors ?? []
              const onPlay    = ann.onPlay ?? null

              const resultStyle = result === 'WIN'
                ? 'bg-green-100 text-green-800'
                : result === 'LOSS'
                ? 'bg-red-100 text-red-800'
                : result === 'BYE'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-700'

              const pdStyle = onPlay === true
                ? 'bg-green-100 text-green-800'
                : onPlay === false
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-500'

              function cycleOnPlay() {
                const next = onPlay === null ? true : onPlay === true ? false : null
                updateAnnotation(match.id, { onPlay: next })
              }

              return (
                <tr key={match.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 font-medium">R{match.round_number}</td>
                  <td className="px-4 py-2.5 text-gray-900 font-medium">{opponent}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${resultStyle}`}>
                      {result}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-500 text-xs">{score}</td>
                  {!compact && (
                    <>
                      <td className="px-4 py-2.5">
                        <ColorPicker
                          selected={oppColors}
                          onChange={colors => updateAnnotation(match.id, { oppColors: colors })}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={cycleOnPlay}
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${pdStyle}`}
                          title="Click to cycle: Play → Draw → Unknown"
                        >
                          {onPlay === true ? 'Play' : onPlay === false ? 'Draw' : '?'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {shareCard && (
        <ShareCardModal
          shareCard={shareCard}
          onClose={() => setShareCard(null)}
          title="Share card"
          altText="Tournament result share card"
          shareTitle="Tournament Result"
        />
      )}
    </div>
  )
}

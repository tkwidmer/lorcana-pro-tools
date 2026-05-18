import { useState, useEffect } from 'react'
import { inferHand } from '../lib/handInference'
import { getAllGames } from '../lib/gameHistory'
import { buildPlayerProfile } from '../lib/playerProfiles'
import { matchupKey } from '../lib/inkColors'

// Build a "deck list" of [{ name, estimatedCopies }] from this game's observed
// cards alone — used as a fallback if we have no cross-game data.
function deckFromObserved(observed) {
  return (observed ?? []).map(c => ({
    name: c.name,
    estimatedCopies: Math.min(4, Math.max(c.plays ?? 0, c.inked ?? 0, 1)),
  }))
}

export function HandPredictor({ playerName, inkColors, observedDeck, handCount, deckCount }) {
  const [profileDeck, setProfileDeck] = useState(null)
  const [useProfile, setUseProfile] = useState(true)

  useEffect(() => {
    if (!playerName) return
    let cancelled = false
    getAllGames().then(records => {
      if (cancelled) return
      const profile = buildPlayerProfile(records, playerName)
      if (!profile) return
      const key = matchupKey(inkColors)
      const deck = profile.decks.find(d => d.key === key)
      if (deck) {
        setProfileDeck(deck.cards.map(c => ({ name: c.name, estimatedCopies: c.estimatedCopies })))
      }
    })
    return () => { cancelled = true }
  }, [playerName, JSON.stringify(inkColors)]) // eslint-disable-line react-hooks/exhaustive-deps

  if (handCount == null || deckCount == null) return null

  const inferredDeck = useProfile && profileDeck ? profileDeck : deckFromObserved(observedDeck)
  const { entries, consistency } = inferHand(inferredDeck, observedDeck, handCount, deckCount)

  if (entries.length === 0) return null

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Likely in Hand ({handCount})
        </div>
        {profileDeck && (
          <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useProfile}
              onChange={e => setUseProfile(e.target.checked)}
              className="rounded scale-75"
            />
            Use full profile
          </label>
        )}
      </div>
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {entries.slice(0, 12).map(e => (
          <div key={e.name} className="flex items-center gap-2 text-xs">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400"
                style={{ width: `${e.probAtLeastOne * 100}%` }}
              />
            </div>
            <span className="text-gray-700 truncate min-w-0 flex-1 text-xs" title={e.name}>
              {e.name}
            </span>
            <span className="text-gray-900 font-semibold tabular-nums w-9 text-right">
              {Math.round(e.probAtLeastOne * 100)}%
            </span>
            {e.expectedInHand >= 0.5 && (
              <span className="text-gray-400 tabular-nums w-8 text-right">
                ×{e.expectedInHand.toFixed(1)}
              </span>
            )}
          </div>
        ))}
      </div>
      {consistency && Math.abs(consistency.diff) > 4 && (
        <div className="text-xs text-gray-400 mt-1">
          {consistency.diff > 0
            ? `Inference overcounts deck by ${consistency.diff} (probabilities may be high)`
            : `Inference undercounts deck by ${-consistency.diff} (some cards unobserved)`}
        </div>
      )}
      <div className="text-xs text-gray-300 mt-1">
        Probability ≥1 copy is in hand (out of {handCount + deckCount} unseen)
      </div>
    </div>
  )
}

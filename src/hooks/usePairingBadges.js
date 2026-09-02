import { useCallback, useRef, useState } from 'react'
import { fetchPairingBadges } from '../lib/tournamentHistoryApi'

// Shared cache + fetcher for "Notable Pairing Badges" (pedigree/rivalry),
// meant to be instantiated once in TournamentLookupPage and passed to both
// MatchesTab and EliminationBracket so switching tabs reuses the same cache.
//
// Both playerId->bool and pairKey->bool caches live in refs (not state) so
// a cache write doesn't itself trigger a re-render — negative results are
// cached too (a player with no pedigree must not be re-requested every
// render), and a small counter in state is bumped once per resolved batch
// purely to force the one re-render that actually needs the new data.
export function usePairingBadges() {
  const pedigreeCache = useRef(new Map()) // playerId -> bool
  const rivalryCache = useRef(new Map()) // pairKey -> bool
  const inFlight = useRef(new Set()) // signatures of in-flight requests
  const [, setVersion] = useState(0)

  const ensureBadges = useCallback((playerIds = [], pairKeys = []) => {
    const missingPlayerIds = [...new Set(playerIds)].filter((id) => !pedigreeCache.current.has(id))
    const missingPairKeys = [...new Set(pairKeys)].filter((key) => !rivalryCache.current.has(key))
    if (missingPlayerIds.length === 0 && missingPairKeys.length === 0) return

    const signature = `${missingPlayerIds.join(',')}|${missingPairKeys.join(',')}`
    if (inFlight.current.has(signature)) return
    inFlight.current.add(signature)

    fetchPairingBadges(missingPlayerIds, missingPairKeys)
      .then(({ pedigree = {}, rivalry = {} }) => {
        for (const id of missingPlayerIds) pedigreeCache.current.set(id, Boolean(pedigree[id]))
        for (const key of missingPairKeys) rivalryCache.current.set(key, Boolean(rivalry[key]))
        setVersion((v) => v + 1)
      })
      .catch((err) => {
        // Badge data is best-effort — never block or crash row rendering.
        console.error('Failed to load pairing badges:', err)
      })
      .finally(() => {
        inFlight.current.delete(signature)
      })
  }, [])

  const hasPedigree = useCallback((playerId) => pedigreeCache.current.get(playerId) === true, [])
  const hasRivalry = useCallback((pairKey) => rivalryCache.current.get(pairKey) === true, [])

  return { ensureBadges, hasPedigree, hasRivalry }
}

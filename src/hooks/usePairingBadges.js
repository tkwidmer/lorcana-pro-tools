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
// The server caps each of playerIds/pairKeys at 500 per request (see
// MAX_BADGE_LIST_SIZE in api/tournament-history.ts) — a big DLC's Standings
// tab can have ~2000 players, so a single ensureBadges call there needs to
// be split into multiple requests rather than exceeding the cap.
const CHUNK_SIZE = 500

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Rivalry answers depend on which event is currently excluded (see
// getPairingBadges's excludeRphEventId), so the cache key folds that in —
// otherwise switching to a different loaded tournament would keep serving
// rivalry answers computed against the previous one.
function rivalryCacheKey(excludeEventId, pairKey) {
  return `${excludeEventId ?? ''}|${pairKey}`
}

export function usePairingBadges() {
  const pedigreeCache = useRef(new Map()) // playerId -> bool
  const rivalryCache = useRef(new Map()) // "excludeEventId|pairKey" -> bool
  const inFlight = useRef(new Set()) // signatures of in-flight requests
  const [, setVersion] = useState(0)

  const ensureBadges = useCallback((playerIds = [], pairKeys = [], excludeEventId = null) => {
    const missingPlayerIds = [...new Set(playerIds)].filter((id) => !pedigreeCache.current.has(id))
    const missingPairKeys = [...new Set(pairKeys)].filter(
      (key) => !rivalryCache.current.has(rivalryCacheKey(excludeEventId, key))
    )
    if (missingPlayerIds.length === 0 && missingPairKeys.length === 0) return

    const playerIdChunks = missingPlayerIds.length > 0 ? chunk(missingPlayerIds, CHUNK_SIZE) : []
    const pairKeyChunks = missingPairKeys.length > 0 ? chunk(missingPairKeys, CHUNK_SIZE) : []
    const batchCount = Math.max(playerIdChunks.length, pairKeyChunks.length)

    for (let i = 0; i < batchCount; i++) {
      const idsBatch = playerIdChunks[i] ?? []
      const keysBatch = pairKeyChunks[i] ?? []
      const signature = `${excludeEventId ?? ''}|${idsBatch.join(',')}|${keysBatch.join(',')}`
      if (inFlight.current.has(signature)) continue
      inFlight.current.add(signature)

      fetchPairingBadges(idsBatch, keysBatch, excludeEventId)
        .then(({ pedigree = {}, rivalry = {} }) => {
          for (const id of idsBatch) pedigreeCache.current.set(id, Boolean(pedigree[id]))
          for (const key of keysBatch) rivalryCache.current.set(rivalryCacheKey(excludeEventId, key), Boolean(rivalry[key]))
          setVersion((v) => v + 1)
        })
        .catch((err) => {
          // Badge data is best-effort — never block or crash row rendering.
          console.error('Failed to load pairing badges:', err)
        })
        .finally(() => {
          inFlight.current.delete(signature)
        })
    }
  }, [])

  const hasPedigree = useCallback((playerId) => pedigreeCache.current.get(playerId) === true, [])
  const hasRivalry = useCallback(
    (pairKey, excludeEventId = null) => rivalryCache.current.get(rivalryCacheKey(excludeEventId, pairKey)) === true,
    []
  )

  return { ensureBadges, hasPedigree, hasRivalry }
}

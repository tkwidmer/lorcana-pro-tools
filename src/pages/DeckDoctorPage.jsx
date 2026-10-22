import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getToken, fetchAllMatchHistory, fetchStats, fetchPersonalStats } from '../lib/duelsApi'
import { getAllGamelogs } from '../lib/gamelogHistory'
import { computeCardImpact } from '../lib/cardImpact'
import { useCards } from '../hooks/useCards'
import { buildCardIdToCard } from '../lib/cardIdResolver'
import { buildCardIndex } from '../lib/cardAnalysis'
import { matchDeckList } from '../lib/decklistShared'
import { deckInks } from '../lib/streamOverlay'
import { deckFingerprint } from '../lib/deckFingerprint'
import {
  countsFromDecklist, countsFromPasted, fieldCardIds, constructedDecks, deckVersions, archetypeCandidates, assignArchetype,
  diffBuild, liftChecklist, archetypeVsColorPairs, colorPairField, personalMatchups, matchupTable, defaultQueueFor,
  deckDoctorVerdict, pairLabel,
} from '../lib/deckDoctor'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Select, Textarea } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { DeckListCard } from '../components/DeckListCard'
import { BuildDiff } from '../components/deckDoctor/BuildDiff'
import { LiftChecklist } from '../components/deckDoctor/LiftChecklist'
import { MatchupsVsField } from '../components/deckDoctor/MatchupsVsField'
import { YourCards } from '../components/deckDoctor/YourCards'

const QUEUES = [
  { id: 'core-bo1', name: 'Core BO1' }, { id: 'core-bo3', name: 'Core BO3' },
  { id: 'infinity-bo1', name: 'Infinity BO1' }, { id: 'infinity-bo3', name: 'Infinity BO3' },
]
const PREFS_KEY = 'lorcana_deck_doctor'
const DECK_NAMES_KEY = 'lorcana_deck_names'

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

function writePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* private mode */ }
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '?')

// The changes from one version of a deck to the current list, as "+2 Card"
// (added since) and "−1 Card" (cut since).
function versionChanges(diff, nameOf) {
  const out = [
    ...diff.onlyField.map((d) => `+${d.field} ${nameOf(d.cardId)}`),
    ...diff.onlyMine.map((d) => `−${d.mine} ${nameOf(d.cardId)}`),
    ...diff.countDiffs.map((d) => `${d.field > d.mine ? '+' : '−'}${Math.abs(d.field - d.mine)} ${nameOf(d.cardId)}`),
  ]
  return out.length > 4 ? `${out.slice(0, 4).join(', ')} and ${out.length - 4} more` : out.join(', ')
}

const entriesFrom = (counts, cardById, nameOf) =>
  [...counts].map(([id, count]) => ({ key: id, name: nameOf(id), count, card: cardById[id] ?? null }))

export function DeckDoctorPage() {
  const hasToken = !!getToken()
  const [prefs] = useState(() => readJson(PREFS_KEY, {}))
  const [queueOverride, setQueueOverride] = useState(prefs.queue ?? null)
  const [deckKey, setDeckKey] = useState(prefs.deckKey ?? null)
  const [mode, setMode] = useState(hasToken ? 'deck' : 'paste')
  const [pasted, setPasted] = useState('')
  const [games, setGames] = useState(hasToken ? null : [])
  const [gamesError, setGamesError] = useState(null)
  const [statsState, setStatsState] = useState({ queue: null, data: null, error: null })
  const [gamelogs, setGamelogs] = useState([])
  const [deckVersionsByDeckId, setDeckVersionsByDeckId] = useState({})
  // { scope, key }: an archetype the user picked, valid only for the deck (or
  // paste) it was picked for, so switching decks falls back to the auto pick.
  const [archetypeOverride, setArchetypeOverride] = useState(null)
  const { cards } = useCards()

  useEffect(() => {
    if (!hasToken) return
    fetchAllMatchHistory().then(setGames).catch((err) => { setGames([]); setGamesError(err.message) })
    getAllGamelogs().then(setGamelogs).catch(() => {})
  }, [hasToken])

  const cardById = useMemo(() => buildCardIdToCard(cards), [cards])
  const nameOf = useMemo(() => (id) => cardById[id]?.fullName ?? cardById[id]?.name ?? id, [cardById])
  const cardIndex = useMemo(() => buildCardIndex(cards ?? []), [cards])

  const decks = useMemo(() => constructedDecks(games ?? [], readJson(DECK_NAMES_KEY, {})), [games])
  const deck = decks.find((d) => d.key === deckKey) ?? decks[0] ?? null
  const deckGames = useMemo(
    () => (deck ? (games ?? []).filter((g) => (g.your_deck_id ?? deckFingerprint(g.your_decklist)) === deck.key) : []),
    [games, deck],
  )

  const queue = queueOverride ?? defaultQueueFor(mode === 'deck' ? deck?.queueName : null)
  useEffect(() => {
    let cancelled = false
    fetchStats({ queue, period: 'all_time' })
      .then((data) => { if (!cancelled) setStatsState({ queue, data, error: null }) })
      .catch((err) => { if (!cancelled) setStatsState({ queue, data: null, error: err.message }) })
    return () => { cancelled = true }
  }, [queue])
  const stats = statsState.queue === queue ? statsState.data : null
  const statsError = statsState.queue === queue ? statsState.error : null
  const statsLoading = statsState.queue !== queue

  const deckId = mode === 'deck' ? deck?.deckId ?? null : null
  useEffect(() => {
    if (!deckId || deckVersionsByDeckId[deckId]) return
    fetchPersonalStats({ deckId })
      .then((data) => setDeckVersionsByDeckId((prev) => ({ ...prev, [deckId]: data.deckVersions ?? [] })))
      .catch(() => setDeckVersionsByDeckId((prev) => ({ ...prev, [deckId]: [] })))
  }, [deckId, deckVersionsByDeckId])

  const pastedEntries = useMemo(() => (mode === 'paste' ? matchDeckList(pasted, cardIndex) : []), [mode, pasted, cardIndex])
  const knownIds = useMemo(() => fieldCardIds(stats), [stats])
  const myCounts = useMemo(
    () => (mode === 'paste' ? countsFromPasted(pastedEntries, cards, knownIds) : countsFromDecklist(deck?.latestDecklist)),
    [mode, pastedEntries, cards, knownIds, deck],
  )
  const myColors = useMemo(
    () => (mode === 'paste' ? deckInks(pastedEntries).slice(0, 2) : deck?.colors ?? []),
    [mode, pastedEntries, deck],
  )
  const hasList = myCounts.size > 0

  const noProfiles = !!stats && !stats.profiles?.length
  const eraName = stats?.meta?.eras?.currentEra?.name
  const candidates = useMemo(() => archetypeCandidates(stats, myColors, myCounts), [stats, myColors, myCounts])
  const auto = useMemo(() => assignArchetype(stats, myColors, myCounts), [stats, myColors, myCounts])
  const scope = mode === 'paste' ? 'paste' : `deck:${deck?.key}`
  const picked = archetypeOverride?.scope === scope ? archetypeOverride.key : undefined
  const archetype = picked === undefined ? auto : candidates.find((c) => c.key === picked) ?? null
  const centroid = archetype?.profile?.centroidCounts ?? null

  const diff = useMemo(() => (centroid ? diffBuild(myCounts, centroid) : null), [myCounts, centroid])
  const archetypeLifts = useMemo(() => liftChecklist(archetype?.profile?.cardLift, myCounts), [archetype, myCounts])
  const pairLifts = useMemo(
    () => liftChecklist(stats?.pairCardLift?.[[...myColors].sort().join('/')], myCounts),
    [stats, myColors, myCounts],
  )
  const allLifts = useMemo(() => [...archetypeLifts, ...pairLifts], [archetypeLifts, pairLifts])
  const versions = useMemo(() => deckVersions(deckGames), [deckGames])
  const field = useMemo(
    () => (archetype ? archetypeVsColorPairs(stats, archetype.key) : colorPairField(stats, myColors)),
    [stats, archetype, myColors],
  )
  const matchups = useMemo(() => (mode === 'deck' ? matchupTable(personalMatchups(deckGames), field) : []), [mode, deckGames, field])
  const deckGamelogs = useMemo(() => (deckId ? gamelogs.filter((g) => g.deck_id === deckId) : []), [gamelogs, deckId])
  const impact = useMemo(
    () => (deckGamelogs.length ? computeCardImpact(deckGamelogs, { deckVersions: deckVersionsByDeckId[deckId] ?? null }).results : []),
    [deckGamelogs, deckVersionsByDeckId, deckId],
  )
  const verdict = useMemo(
    // A pasted list has no results of its own, so no matchup sentence.
    () => deckDoctorVerdict({ eraName, archetype, noProfiles, lifts: allLifts, impact, matchups: mode === 'deck' ? matchups : null, nameOf }),
    [eraName, archetype, noProfiles, allLifts, impact, matchups, mode, nameOf],
  )

  const chooseDeck = (key) => {
    setDeckKey(key)
    setQueueOverride(null)
    writePrefs({ queue: null, deckKey: key })
  }
  const chooseQueue = (q) => {
    setQueueOverride(q)
    writePrefs({ queue: q, deckKey })
  }

  const colorLabel = myColors.length ? pairLabel([...myColors].sort()) : 'your colours'
  const queueName = stats?.meta?.queue?.name ?? QUEUES.find((q) => q.id === queue)?.name
  const profile = archetype?.profile

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Deck Doctor"
        description="Your list against the field's build, lift cards, your own card performance, and your matchups versus the field."
      />

      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm text-gray-600">
            <span className="block mb-1">Field queue</span>
            <Select value={queue} onChange={(e) => chooseQueue(e.target.value)}>
              {QUEUES.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </Select>
          </label>
          {mode === 'deck' && decks.length > 0 && (
            <label className="text-sm text-gray-600 min-w-0 flex-1">
              <span className="block mb-1">Deck</span>
              <Select value={deck?.key ?? ''} onChange={(e) => chooseDeck(e.target.value)} className="w-full max-w-xl">
                {decks.map((d) => (
                  <option key={d.key} value={d.key}>{`${d.name} · ${d.queueName ?? ''} · ${d.wins}-${d.losses}`}</option>
                ))}
              </Select>
            </label>
          )}
          {(hasToken || mode === 'deck') && (
            <Button variant="quiet" onClick={() => setMode(mode === 'deck' ? 'paste' : 'deck')}>
              {mode === 'deck' ? 'Paste a list instead' : 'Use my decks'}
            </Button>
          )}
        </div>
        {mode === 'paste' && (
          <Textarea
            rows={8}
            className="w-full mt-4 font-mono"
            placeholder={'4 Card Name\n4 Another Card - Version'}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
        )}
      </Card>

      {!hasToken && (
        <Card className="p-4 mb-6" title="Connect duels.ink">
          <p className="text-sm text-gray-600">
            Your decks and results come from your duels.ink match history. Add your API token in{' '}
            <Link to="/settings" className="underline">Settings</Link>, or paste a list to compare it against the field.
          </p>
        </Card>
      )}
      {mode === 'deck' && hasToken && games == null && <p className="text-sm text-gray-500 mb-6">Loading your match history…</p>}
      {mode === 'deck' && gamesError && <p className="text-sm text-red-700 mb-6">Couldn't load match history: {gamesError}</p>}
      {mode === 'deck' && hasToken && games != null && !gamesError && decks.length === 0 && (
        <p className="text-sm text-gray-600 mb-6">No ranked games with a constructed deck yet. Paste a list to compare it against the field.</p>
      )}
      {statsLoading && <p className="text-sm text-gray-500 mb-6">Loading field data…</p>}
      {statsError && <p className="text-sm text-red-700 mb-6">Couldn't load duels.ink meta stats: {statsError}</p>}
      {noProfiles && (
        <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded p-3 text-sm mb-6">
          duels.ink hasn't published {eraName ?? 'this set'}'s archetype builds yet; the build comparison appears when it does.
        </div>
      )}

      {hasList && stats && (
        <div className="space-y-6">
          <Card className="p-4" title="Verdict">
            <div className="space-y-2">
              {verdict.map((b, i) => <p key={i} className="text-gray-900">{b.text}</p>)}
            </div>
          </Card>

          {!noProfiles && (
            <Card className="p-4" title="Your list vs the field's build">
              <label className="text-sm text-gray-600 block mb-4">
                <span className="block mb-1">Compare against</span>
                <Select
                  value={archetype?.key ?? ''}
                  onChange={(e) => setArchetypeOverride({ scope, key: e.target.value || null })}
                >
                  <option value="">No archetype</option>
                  {candidates.map((c) => (
                    <option key={c.key} value={c.key}>{`${c.name} · ${Math.round(c.overlap * 100)}% match`}</option>
                  ))}
                </Select>
              </label>
              {candidates.length === 0 && (
                <p className="text-sm text-gray-600 mb-4">duels.ink lists no {colorLabel} archetype for this queue.</p>
              )}
              <div className={`grid grid-cols-1 gap-4 mb-6 ${centroid ? 'md:grid-cols-2' : ''}`}>
                <DeckListCard title="Your list" entries={entriesFrom(myCounts, cardById, nameOf)} />
                {centroid && (
                  <DeckListCard
                    title={archetype.name}
                    subtitle={`duels.ink's average build for the most-played variant · ${profile.sampleCount ?? '?'} decks · ${profile.gamesPlayed ?? '?'} games`}
                    entries={entriesFrom(new Map(Object.entries(centroid)), cardById, nameOf)}
                  />
                )}
              </div>
              {diff && <BuildDiff diff={diff} lifts={archetypeLifts} nameOf={nameOf} />}
              {mode === 'deck' && versions.length > 1 && (
                <div className="mt-6">
                  <h3 className="font-display uppercase tracking-wide text-sm text-gray-900 mb-2">Versions</h3>
                  <ul className="space-y-1 text-sm">
                    {versions.map((v, i) => (
                      <li key={v.fingerprint} className="flex flex-wrap gap-x-3 text-gray-700">
                        <span className="tabular-nums">{fmtDate(v.firstAt)} – {fmtDate(v.lastAt)}</span>
                        <span className="tabular-nums text-gray-900">{v.wins}-{v.losses}</span>
                        <span className="text-gray-500">{i === 0 ? 'current' : versionChanges(v.diffFromLatest, nameOf)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {(archetypeLifts.length > 0 || pairLifts.length > 0) && (
            <Card className="p-4" title="Lift checklist">
              <p className="text-sm text-gray-500 mb-4">
                Cards that lift you're missing are tinted gold; cards that sink you're running are tinted red.
              </p>
              <div className="grid lg:grid-cols-2 gap-6">
                <LiftChecklist title={`In ${archetype?.name ?? 'your archetype'}`} rows={archetypeLifts} nameOf={nameOf} />
                <LiftChecklist title={`In ${colorLabel}`} rows={pairLifts} nameOf={nameOf} />
              </div>
            </Card>
          )}

          {mode === 'deck' && (
            <Card className="p-4" title="Your cards">
              <YourCards impact={impact} lifts={allLifts} hasGamelogs={deckGamelogs.length > 0} nameOf={nameOf} />
            </Card>
          )}

          {mode === 'deck' && (
            <Card className="p-4" title="Matchups vs the field">
              <MatchupsVsField
                rows={matchups}
                fieldLabel={archetype ? `${archetype.name} (field)` : `${colorLabel} (field, by colour pair)`}
              />
            </Card>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-8">
        Field data from duels.ink's public meta stats for {queueName}, current set only. Lift is the card's win rate minus its
        archetype's, in percentage points.
      </p>
    </div>
  )
}

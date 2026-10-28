import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getToken, subscribeTokens, fetchAllMatchHistory, fetchDecks } from '../lib/duelsApi'
import { useCards } from '../hooks/useCards'
import { buildCardIdToName } from '../lib/cardIdResolver'
import { fromMatchHistoryRow, buildDeckVersions } from '../lib/deckVersions'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Field'
import { InkIcons } from '../components/InkIcons'
import { DeckListCard } from '../components/DeckListCard'
import { DeckVersionTimeline } from '../components/deckVersions/DeckVersionTimeline'
import { DeckVersionCompare } from '../components/deckVersions/DeckVersionCompare'

const DECK_NAMES_KEY = 'lorcana_deck_names'

function readDeckNames() {
  try { return JSON.parse(localStorage.getItem(DECK_NAMES_KEY)) ?? {} } catch { return {} }
}

export function DeckLabPage() {
  // Tokens load from Supabase after sign-in, possibly after first render.
  const hasToken = !!useSyncExternalStore(subscribeTokens, getToken)
  const [searchParams, setSearchParams] = useSearchParams()
  const [games, setGames] = useState(null)
  const [loaded, setLoaded] = useState(0)
  const [loadError, setLoadError] = useState(null)
  const [deckNames, setDeckNames] = useState(readDeckNames)
  const [pick, setPick] = useState({})
  const { cards, loading: cardsLoading } = useCards()

  useEffect(() => {
    if (!hasToken) return
    // ponytail: pages are fetched back to back; a history past ~20 pages (5,000 games) can hit duels.ink's 20 requests/minute limit and fail.
    fetchAllMatchHistory({ limit: 250, maxPages: Infinity, onPage: setLoaded })
      .then(setGames)
      .catch(err => setLoadError(err.message))
    fetchDecks()
      .then(data => setDeckNames(prev => ({ ...prev, ...Object.fromEntries((data.decks ?? []).filter(d => d.id && d.name).map(d => [d.id, d.name])) })))
      .catch(() => {}) // names are cosmetic; decks fall back to their colors
  }, [hasToken])

  const built = useMemo(() => {
    if (!games || cardsLoading) return null
    try {
      return buildDeckVersions(games.map(fromMatchHistoryRow), buildCardIdToName(cards))
    } catch (err) {
      return { error: err.message }
    }
  }, [games, cards, cardsLoading])

  const colorsByDeck = useMemo(() => {
    const out = {}
    for (const g of games ?? []) if (g.your_deck_id) out[g.your_deck_id] ??= g.your_deck_colors
    return out
  }, [games])

  const cardByName = useMemo(() => {
    const out = {}
    for (const c of cards ?? []) out[c.fullName] ??= c
    return out
  }, [cards])

  const decks = built?.decks ?? []
  const deck = decks.find(d => d.deckKey === searchParams.get('deck')) ?? decks[0] ?? null
  const versions = deck?.versions ?? []
  const defaults = { a: versions.at(-1)?.label, b: versions.at(-2)?.label }
  const labels = pick.deckKey === deck?.deckKey ? pick : defaults
  const a = versions.find(v => v.label === labels.a)
  const b = versions.find(v => v.label === labels.b)
  const setLabel = (side, label) => setPick({ ...labels, deckKey: deck.deckKey, [side]: label })

  const entries = v => [...v.cards].map(([name, count]) => ({ key: name, name, count, card: cardByName[name] ?? null }))
  const deckTitle = d => deckNames[d.deckKey] ?? 'Unnamed deck'

  return (
    <div className="w-full px-6 py-8">
      <PageHeader
        title="Deck Iteration Lab"
        description="Every version of each deck you've played on duels.ink, with its record, the cards you changed, and whether the data can actually tell two versions apart yet."
      />

      {!hasToken && (
        <p className="text-gray-600">
          Add your duels.ink API token in <Link to="/settings" className="underline">Settings</Link> to load your match history.
        </p>
      )}
      {loadError && <p className="text-red-700">Couldn't load match history: {loadError}</p>}
      {built?.error && <p className="text-red-700">Couldn't build deck versions: {built.error}</p>}
      {hasToken && !loadError && !built && (
        <p className="text-gray-500">Loading match history… {loaded.toLocaleString()} games so far</p>
      )}

      {deck && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={deck.deckKey} onChange={e => setSearchParams({ deck: e.target.value })} aria-label="Deck">
              {decks.map(d => (
                <option key={d.deckKey} value={d.deckKey}>
                  {deckTitle(d)} · {d.games} games · {d.versions.length} {d.versions.length === 1 ? 'version' : 'versions'}
                </option>
              ))}
            </Select>
            <InkIcons colors={colorsByDeck[deck.deckKey]} />
          </div>

          <Card title="Versions" description="A version is one distinct list. Swapping a card for another printing of it isn't a new version; going back to an old list reuses its version. Faded rows have under 10 games." className="p-5">
            <DeckVersionTimeline versions={versions} />
          </Card>

          {versions.length > 1 && (
            <Card title="Compare" className="p-5">
              <div className="flex flex-wrap items-center gap-2 mb-5 text-sm">
                <Select value={labels.a} onChange={e => setLabel('a', e.target.value)} aria-label="First version">
                  {versions.map(v => <option key={v.label}>{v.label}</option>)}
                </Select>
                <span className="text-gray-500">vs</span>
                <Select value={labels.b} onChange={e => setLabel('b', e.target.value)} aria-label="Second version">
                  {versions.map(v => <option key={v.label}>{v.label}</option>)}
                </Select>
              </div>
              <DeckVersionCompare a={a} b={b} />
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {[...new Set([a, b])].filter(Boolean).map(v => (
              <DeckListCard key={v.label} title={`${deckTitle(deck)} · ${v.label}`} subtitle={`${v.wins}–${v.losses}`} entries={entries(v)} />
            ))}
          </div>
        </div>
      )}

      {built && !built.error && (
        <p className="mt-6 text-sm text-gray-500">
          {built.unassigned.length > 0
            ? `Unassigned: ${built.unassigned.length.toLocaleString()} games have no deck id or no recorded list, so they aren't in any version.`
            : !deck && 'No games with a deck list yet.'}
        </p>
      )}
    </div>
  )
}

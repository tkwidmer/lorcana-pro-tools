import { useEffect, useMemo, useState } from 'react'
import { getAllGamelogs } from '../lib/gamelogHistory'
import { resolveColors, matchupKey, VALID_INKS } from '../lib/inkColors'

function InkImg({ color, size = 'w-4 h-4' }) {
  if (!color) return null
  const name = color.toLowerCase()
  if (!VALID_INKS.includes(name)) return null
  return <img src={`/ink/${name}.png`} alt={name} title={name} className={`${size} flex-shrink-0`} />
}

// Aggregates parsed gamelogs into a per-opponent directory: overall record,
// one bucket per ink-color combination we've seen them play, and — within
// each bucket — every card we directly observed them play/ink/discard/lose,
// summed across games. Only publicly-visible zone changes are counted; we
// never surface anything about the opponent's hand or unrevealed draws.
function buildDirectory(games) {
  const opponents = new Map()

  for (const game of games) {
    const myPlayerNum = game.myPlayerNum
    if (myPlayerNum == null) continue
    const oppNum = myPlayerNum === 1 ? 2 : 1
    const rawName = oppNum === 1 ? game.p1Name : game.p2Name
    const name = rawName?.trim()
    if (!name || /^Player [12]$/.test(name)) continue

    const colors = resolveColors(game.oppInkCombo)
    const deckKey = matchupKey(game.oppInkCombo)
    const cardList = (oppNum === 1 ? game.p1?.cardList : game.p2?.cardList) ?? []
    const won = game.winner === String(myPlayerNum) || game.winner === myPlayerNum

    if (!opponents.has(name)) {
      opponents.set(name, { name, gameCount: 0, wins: 0, losses: 0, decks: new Map(), lastPlayed: 0 })
    }
    const opp = opponents.get(name)
    opp.gameCount += 1
    if (won) opp.wins += 1
    else opp.losses += 1
    if (game.playedAt && game.playedAt > opp.lastPlayed) opp.lastPlayed = game.playedAt

    if (!opp.decks.has(deckKey)) {
      opp.decks.set(deckKey, { key: deckKey, colors, gameCount: 0, wins: 0, losses: 0, cards: new Map() })
    }
    const deck = opp.decks.get(deckKey)
    deck.gameCount += 1
    if (won) deck.wins += 1
    else deck.losses += 1

    for (const c of cardList) {
      const played = c.played || 0
      const inked = c.inked || 0
      const discarded = c.discarded || 0
      const destroyed = c.destroyed || 0
      if (played + inked + discarded + destroyed === 0) continue

      if (!deck.cards.has(c.name)) {
        deck.cards.set(c.name, { name: c.name, played: 0, inked: 0, discarded: 0, destroyed: 0, seenIn: 0 })
      }
      const stat = deck.cards.get(c.name)
      stat.played += played
      stat.inked += inked
      stat.discarded += discarded
      stat.destroyed += destroyed
      stat.seenIn += 1
    }
  }

  return Array.from(opponents.values())
    .map(o => {
      const decks = Array.from(o.decks.values())
        .map(d => ({
          ...d,
          winRate: d.gameCount ? (d.wins / d.gameCount) * 100 : 0,
          cards: Array.from(d.cards.values()).sort(
            (a, b) => b.played + b.inked + b.discarded + b.destroyed - (a.played + a.inked + a.discarded + a.destroyed)
          ),
        }))
        .sort((a, b) => b.gameCount - a.gameCount)

      return {
        ...o,
        winRate: o.gameCount ? (o.wins / o.gameCount) * 100 : 0,
        decks,
        allColors: Array.from(new Set(decks.flatMap(d => d.colors))),
      }
    })
    .sort((a, b) => b.gameCount - a.gameCount)
}

function WinRate({ wins, losses, winRate }) {
  const color = winRate >= 55 ? 'text-green-600' : winRate <= 45 ? 'text-red-500' : 'text-gray-500'
  return (
    <span className={`font-medium ${color}`}>
      {winRate.toFixed(0)}% <span className="text-gray-400 font-normal">({wins}-{losses})</span>
    </span>
  )
}

function DeckCardTable({ deck }) {
  if (deck.cards.length === 0) {
    return <div className="text-sm text-gray-500 py-2">No card activity observed for this deck yet.</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-1 pr-3 font-medium">Card</th>
            <th className="py-1 px-2 font-medium text-right">Seen In</th>
            <th className="py-1 px-2 font-medium text-right">Played</th>
            <th className="py-1 px-2 font-medium text-right">Inked</th>
            <th className="py-1 px-2 font-medium text-right">Discarded</th>
            <th className="py-1 pl-2 font-medium text-right">Destroyed</th>
          </tr>
        </thead>
        <tbody>
          {deck.cards.map(c => (
            <tr key={c.name} className="border-b border-gray-100 last:border-0">
              <td className="py-1 pr-3 text-gray-900">{c.name}</td>
              <td className="py-1 px-2 text-right text-gray-600">{c.seenIn}g</td>
              <td className="py-1 px-2 text-right text-gray-600">{c.played || '—'}</td>
              <td className="py-1 px-2 text-right text-gray-600">{c.inked || '—'}</td>
              <td className="py-1 px-2 text-right text-gray-600">{c.discarded || '—'}</td>
              <td className="py-1 pl-2 text-right text-gray-600">{c.destroyed || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OpponentDetail({ opponent }) {
  const [deckIndex, setDeckIndex] = useState(0)
  const deck = opponent.decks[Math.min(deckIndex, opponent.decks.length - 1)]

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 className="text-xl font-semibold text-gray-900">{opponent.name}</h2>
        <WinRate wins={opponent.wins} losses={opponent.losses} winRate={opponent.winRate} />
      </div>
      <div className="text-sm text-gray-500 mb-4">
        {opponent.gameCount} game{opponent.gameCount === 1 ? '' : 's'} tracked
        {opponent.lastPlayed ? ` · last played ${new Date(opponent.lastPlayed).toLocaleDateString()}` : ''}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {opponent.decks.map((d, i) => (
          <button
            key={d.key}
            onClick={() => setDeckIndex(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition ${
              i === deckIndex
                ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-0.5">
              {d.colors.length > 0 ? d.colors.map(c => <InkImg key={c} color={c} size="w-4 h-4" />) : <span className="text-xs">Unknown</span>}
            </span>
            <span>{d.gameCount}g</span>
            <span className={d.winRate >= 55 ? 'text-green-600' : d.winRate <= 45 ? 'text-red-500' : 'text-gray-400'}>
              {d.winRate.toFixed(0)}%
            </span>
          </button>
        ))}
      </div>

      {deck && <DeckCardTable deck={deck} />}
    </div>
  )
}

export function OpponentDirectoryPage() {
  const [games, setGames] = useState(null)
  const [search, setSearch] = useState('')
  const [inkFilter, setInkFilter] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    getAllGamelogs().then(setGames)
  }, [])

  const directory = useMemo(() => (games ? buildDirectory(games) : []), [games])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return directory.filter(o => {
      if (term && !o.name.toLowerCase().includes(term)) return false
      if (inkFilter.length > 0 && !inkFilter.every(c => o.allColors.includes(c))) return false
      return true
    })
  }, [directory, search, inkFilter])

  const selectedOpponent = filtered.find(o => o.name === selected) ?? null

  const toggleInk = color => {
    setInkFilter(prev => (prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]))
  }

  if (games === null) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-gray-500">Loading imported games…</div>
      </div>
    )
  }

  if (directory.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Opponent Directory</h1>
        <p className="text-gray-600">
          No opponents found yet. Import gamelogs on the{' '}
          <a href="/analytics" className="text-indigo-600 hover:underline">Analytics</a> page and they'll show up here.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Opponent Directory</h1>
      <p className="text-gray-600 mb-6">
        Every card we've seen your opponents play, ink, or discard — aggregated across all imported games.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search opponent name…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-1.5 items-center">
          {VALID_INKS.map(color => (
            <button
              key={color}
              onClick={() => toggleInk(color)}
              className={`p-1.5 rounded-md border transition ${
                inkFilter.includes(color) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
              }`}
              title={color}
            >
              <InkImg color={color} size="w-5 h-5" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-6">
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
          {filtered.length === 0 && <div className="p-4 text-sm text-gray-500">No opponents match your filters.</div>}
          {filtered.map(o => (
            <button
              key={o.name}
              onClick={() => setSelected(o.name)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${
                selected === o.name ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-900 truncate">{o.name}</span>
                <span className="text-xs text-gray-500 flex-shrink-0">{o.gameCount}g</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex gap-1">
                  {o.allColors.map(c => <InkImg key={c} color={c} size="w-3.5 h-3.5" />)}
                </div>
                <span className={`text-xs font-medium ${o.winRate >= 55 ? 'text-green-600' : o.winRate <= 45 ? 'text-red-500' : 'text-gray-500'}`}>
                  {o.winRate.toFixed(0)}% WR
                </span>
              </div>
            </button>
          ))}
        </div>

        <div>
          {selectedOpponent ? (
            <OpponentDetail opponent={selectedOpponent} />
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
              Select an opponent to see everything we've observed about their deck.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

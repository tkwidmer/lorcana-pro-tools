import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getAllGames } from '../lib/scoutedGames'
import { buildPlayerProfile } from '../lib/playerProfiles'
import { resolveColors } from '../lib/inkColors'

function InkRow({ colors, size = 'w-5 h-5' }) {
  const resolved = resolveColors(colors)
  if (!resolved.length) return null
  return (
    <div className="flex gap-1">
      {resolved.map(c => (
        <img key={c} src={`/ink/${c}.png`} alt={c} className={size} title={c} />
      ))}
    </div>
  )
}

function pct(n) { return n == null ? '—' : `${Math.round(n * 100)}%` }
function num(n, d = 1) { return n == null ? '—' : n.toFixed(d) }

function DeckCard({ deck }) {
  const [open, setOpen] = useState(true)
  const wentFirstRate = deck.wentFirst + deck.wentSecond > 0
    ? deck.wentFirst / (deck.wentFirst + deck.wentSecond)
    : null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <InkRow colors={deck.colors} />
        <div className="flex-1">
          <div className="font-semibold text-gray-900 capitalize">
            {deck.colors?.join(' / ') || deck.key}
          </div>
          <div className="text-xs text-gray-500">
            {deck.gameCount} game{deck.gameCount !== 1 ? 's' : ''}
            {deck.winRate != null && (
              <> · {deck.wins}–{deck.losses} ({pct(deck.winRate)})</>
            )}
          </div>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          {open ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {open && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Metric label="Quests/turn" value={num(deck.questsPerTurn, 2)} />
            <Metric label="Challenges/turn" value={num(deck.challengesPerTurn, 2)} />
            <Metric label="Ink rate" value={pct(deck.inkRate)} hint="inks per turn taken" />
            <Metric label="Avg final lore" value={num(deck.avgFinalLore, 1)} />
            <Metric label="Avg game length" value={num(deck.avgTurns, 1) + ' turns'} />
            <Metric label="Went first" value={wentFirstRate != null ? pct(wentFirstRate) : '—'} />
            <Metric label="Slots accounted for" value={`${deck.totalSlots} / 60`} hint={`${deck.uniqueCards} unique cards seen`} />
            <Metric label="Confidence" value={
              deck.totalSlots >= 50 ? 'High' :
              deck.totalSlots >= 30 ? 'Medium' : 'Low'
            } />
          </div>

          <div>
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
              Inferred Decklist ({deck.uniqueCards} unique, ~{deck.totalSlots} of 60 slots)
            </div>
            <div className="border border-gray-200 rounded max-h-96 overflow-y-auto">
              {deck.cards.map((c, i) => (
                <div key={c.name} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-gray-100 last:border-0">
                  <span className="text-gray-400 w-5">{i + 1}</span>
                  <span className="font-bold text-gray-900 w-6">{c.estimatedCopies}×</span>
                  <span className="flex-1 truncate text-gray-800">{c.name}</span>
                  <span className="text-gray-400 text-xs whitespace-nowrap">
                    {c.plays > 0 && <span title="max plays in a game">{c.plays}p</span>}
                    {c.plays > 0 && c.inks > 0 && ' · '}
                    {c.inks > 0 && <span title="max inked in a game">{c.inks}i</span>}
                    {' · '}
                    <span title="games this card was seen in">{c.seenIn}/{deck.gameCount}g</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-400 mt-2">
              <span className="font-semibold">p</span> = max plays in a single game ·
              <span className="font-semibold"> i</span> = max inks in a single game ·
              <span className="font-semibold"> g</span> = games seen in
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Games</div>
            <div className="space-y-1">
              {deck.games.map(g => {
                const opp = g.side === 1 ? g.game.p2Name : g.game.p1Name
                const won = g.game.winner === g.side
                const lost = g.game.winner != null && g.game.winner !== g.side
                return (
                  <Link
                    key={g.record.uuid}
                    to={`/scouting/game/${g.record.uuid}`}
                    className="flex items-center gap-2 text-xs bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded"
                  >
                    <span className={`w-12 font-medium ${won ? 'text-green-700' : lost ? 'text-red-700' : 'text-gray-400'}`}>
                      {won ? 'Win' : lost ? 'Loss' : '—'}
                    </span>
                    <span className="text-gray-500">vs</span>
                    <span className="text-gray-800 truncate flex-1">{opp}</span>
                    <span className="text-gray-400">{g.game.currentTurn ?? '?'} turns</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ label, value, hint }) {
  return (
    <div className="bg-gray-50 rounded p-2">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-400">{hint}</div>}
    </div>
  )
}

export function PlayerProfilePage() {
  const { name } = useParams()
  const decodedName = decodeURIComponent(name)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllGames().then(records => {
      setProfile(buildPlayerProfile(records, decodedName))
      setLoading(false)
    })
  }, [decodedName])

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-4">
        <Link to="/library?tab=players" className="text-xs text-gray-500 hover:text-gray-900">← All players</Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : !profile ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-sm mb-2">No games found for "{decodedName}".</div>
          <Link to="/library?tab=players" className="text-sm text-blue-600 hover:underline">All players →</Link>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{profile.name}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
              <span>{profile.gameCount} game{profile.gameCount !== 1 ? 's' : ''}</span>
              {profile.winRate != null && (
                <span>{profile.wins}–{profile.losses} ({pct(profile.winRate)})</span>
              )}
              <span>{profile.decks.length} deck{profile.decks.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {profile.decks.map(deck => (
            <DeckCard key={deck.key} deck={deck} />
          ))}
        </>
      )}
    </div>
  )
}

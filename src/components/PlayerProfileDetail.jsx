import { useState } from 'react'
import { Link } from 'react-router-dom'
import { InkIcons } from './InkIcons'
import { StatCard } from './StatCard'

function InkRow({ colors, size = 'w-5 h-5' }) {
  return <InkIcons colors={colors} size={size} sort className="gap-1" />
}

function pct(n) { return n == null ? '—' : `${Math.round(n * 100)}%` }
function num(n, d = 1) { return n == null ? '—' : n.toFixed(d) }

function SourceBadge({ hasScoutedData, hasGamelogData }) {
  if (hasScoutedData && hasGamelogData) {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">Scouted + Ranked</span>
  }
  if (hasScoutedData) {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Scouted only</span>
  }
  return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">Ranked only</span>
}

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
          <div className="flex items-center gap-2">
            <div className="font-semibold text-gray-900 capitalize">
              {deck.colors?.join(' / ') || deck.key}
            </div>
            <SourceBadge hasScoutedData={deck.hasScoutedData} hasGamelogData={deck.hasGamelogData} />
          </div>
          <div className="text-xs text-gray-500">
            {deck.gameCount} game{deck.gameCount !== 1 ? 's' : ''}
            {deck.hasScoutedData && deck.hasGamelogData && (
              <span className="text-gray-400"> ({deck.scoutedGameCount} scouted, {deck.gamelogGameCount} ranked)</span>
            )}
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
          {deck.hasScoutedData ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatCard label="Quests/turn" value={num(deck.questsPerTurn, 2)} />
              <StatCard label="Challenges/turn" value={num(deck.challengesPerTurn, 2)} />
              <StatCard label="Ink rate" value={pct(deck.inkRate)} hint="inks per turn taken" />
              <StatCard label="Avg final lore" value={num(deck.avgFinalLore, 1)} />
              <StatCard label="Avg game length" value={num(deck.avgTurns, 1) + ' turns'} />
              <StatCard label="Went first" value={wentFirstRate != null ? pct(wentFirstRate) : '—'} />
              <StatCard label="Slots accounted for" value={`${deck.totalSlots} / 60`} hint={`${deck.uniqueCards} unique cards seen`} />
              <StatCard label="Confidence" value={
                deck.totalSlots >= 50 ? 'High' :
                deck.totalSlots >= 30 ? 'Medium' : 'Low'
              } />
            </div>
          ) : (
            <div className="mb-4 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
              Turn-by-turn stats (quests/turn, ink rate, went-first rate) need a scouted game — this deck's data comes from imported gamelogs only, which track per-card totals but not turn-level detail.
            </div>
          )}

          <div>
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
              {deck.hasScoutedData
                ? `Inferred Decklist (${deck.uniqueCards} unique, ~${deck.totalSlots} of 60 slots)`
                : `Cards Observed (${deck.uniqueCards} unique)`}
            </div>
            <div className="border border-gray-200 rounded max-h-96 overflow-y-auto">
              {deck.cards.map((c, i) => (
                <div key={c.name} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-gray-100 last:border-0">
                  <span className="text-gray-400 w-5">{i + 1}</span>
                  {deck.hasScoutedData && <span className="font-bold text-gray-900 w-6">{c.estimatedCopies}×</span>}
                  <span className="flex-1 truncate text-gray-800">{c.name}</span>
                  <span className="text-gray-400 text-xs whitespace-nowrap">
                    {c.plays > 0 && <span title="max plays in a single scouted game">{c.plays}p</span>}
                    {c.plays > 0 && c.inks > 0 && ' · '}
                    {c.inks > 0 && <span title="max inked in a single scouted game">{c.inks}i</span>}
                    {(c.plays > 0 || c.inks > 0) && c.played + c.discarded + c.destroyed > 0 && ' · '}
                    {c.played > 0 && <span title="total plays across ranked games">{c.played}rp</span>}
                    {c.played > 0 && c.discarded > 0 && ' · '}
                    {c.discarded > 0 && <span title="total discards across ranked games">{c.discarded}d</span>}
                    {(c.played > 0 || c.discarded > 0) && c.destroyed > 0 && ' · '}
                    {c.destroyed > 0 && <span title="total times destroyed across ranked games">{c.destroyed}x</span>}
                    {' · '}
                    <span title="games this card was seen in, across both sources">{c.seenIn}/{deck.gameCount}g</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-400 mt-2">
              <span className="font-semibold">p</span> = max plays in a scouted game ·
              <span className="font-semibold"> i</span> = max inks in a scouted game ·
              <span className="font-semibold"> rp</span> = total ranked plays ·
              <span className="font-semibold"> d</span> = ranked discards ·
              <span className="font-semibold"> x</span> = ranked destructions ·
              <span className="font-semibold"> g</span> = games seen in
            </div>
          </div>

          {deck.games.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Scouted Games</div>
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
          ) : deck.gamelogGameCount > 0 && (
            <div className="mt-4 text-xs text-gray-500">
              {deck.gamelogGameCount} ranked game{deck.gamelogGameCount !== 1 ? 's' : ''} imported from duels.ink — no per-game board state available for this deck, only the aggregate card totals above.
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Full per-opponent profile view — header stats + one DeckCard per ink-color
// deck bucket. Shared by the standalone /players/:name page and the Library's
// inline Players-tab detail panel so both stay in sync with one rendering.
export function PlayerProfileDetail({ profile }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{profile.name}</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
          <span>
            {profile.gameCount} game{profile.gameCount !== 1 ? 's' : ''}
            {profile.scoutedGameCount > 0 && profile.gamelogGameCount > 0 && (
              <span className="text-gray-400"> ({profile.scoutedGameCount} scouted, {profile.gamelogGameCount} ranked)</span>
            )}
          </span>
          {profile.winRate != null && (
            <span>{profile.wins}–{profile.losses} ({pct(profile.winRate)})</span>
          )}
          <span>{profile.decks.length} deck{profile.decks.length !== 1 ? 's' : ''}</span>
          {profile.lastPlayed && (
            <span className="text-gray-400">last played {new Date(profile.lastPlayed).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      {profile.decks.map(deck => (
        <DeckCard key={deck.key} deck={deck} />
      ))}
    </div>
  )
}

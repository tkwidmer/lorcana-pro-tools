import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchPublicTable, subscribeToTable } from '../lib/streamTables'
import { rowToState, timerRemainingMs, formatClock, casterPoints } from '../lib/streamOverlay'
import { parseDeckList } from '../lib/parseDeckList'
import { ordinal } from '../lib/resultsArchive'
import { InkIcon } from '../components/InkIcons'

// Caster notes for one stream table: the same public row the OBS view
// renders, laid out to read from a second screen — each player's talking
// points, archive finishes and decklist on their own side, the head-to-head
// and the round's results from the other tables between, the live score,
// and the standings snapshot across the bottom. Follows the row's
// broadcasts, so a new pairing or a sent standings snapshot shows up by
// itself. Unguarded like the view: casters have no session, and the link
// carries only the table id, so it can't change anything.
export function StreamOverlayNotesPage() {
  const [searchParams] = useSearchParams()
  const tableId = searchParams.get('table') ?? ''
  const [row, setRow] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    fetchPublicTable(tableId).then(setRow).catch(e => setError(e.message))
    return subscribeToTable(tableId, setRow)
  }, [tableId])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!row) {
    return <div className="h-screen grid place-items-center font-display text-2xl uppercase tracking-widest text-gray-500 text-center px-6">{error ?? 'Loading the stream table…'}</div>
  }

  const state = rowToState(row)
  const { players } = state
  const card = row.player_card
  const names = players.map(p => p.name)
  const remaining = timerRemainingMs(state, now)
  const standings = row.standings
  const results = row.results
  const onStream = r => [r.p1, r.p2].some(n => n && names.includes(n))

  return (
    <div className="min-h-screen bg-paper text-gray-900 px-6 py-5">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b-2 border-gray-900 pb-3">
        <h1 className="text-3xl">Caster notes</h1>
        <span className="font-display uppercase tracking-wide text-gray-600">{[state.eventName, state.round, state.note].filter(Boolean).join(' · ')}</span>
        <span className={`ml-auto font-display uppercase tracking-widest text-sm ${state.mode === 'break' ? 'text-gray-500' : 'text-emerald-700'}`}>
          {state.mode === 'break' ? 'Break' : 'Live'} · {formatClock(remaining)} left
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_300px_1fr] gap-6">
        {players.map((p, i) => (
          <div key={i} className={i === 1 ? 'lg:order-3' : ''}>
            <div className="flex items-center gap-3">
              <h2 className="font-display text-3xl uppercase tracking-wide">{p.name || `Player ${i + 1}`}</h2>
              <span className="text-lg text-gray-600 tabular-nums">{p.record}</span>
              <span className="flex gap-1">{p.inks.map(ink => <InkIcon key={ink} color={ink} size={22} />)}</span>
            </div>
            {card && (
              <div className="text-sm text-gray-600">
                {card.players[i].majorsPlayed} majors · {card.players[i].topCutCount} top cut{card.players[i].topCutCount === 1 ? '' : 's'} · {card.players[i].dayTwoCount} Day 2{card.players[i].dayTwoCount === 1 ? '' : 's'}
              </div>
            )}

            <h3 className="mt-4 font-display uppercase tracking-wider text-xs text-gray-500">Talking points</h3>
            {card ? (
              <ul className="mt-1 space-y-1.5 text-[15px] leading-snug">
                {casterPoints(card, i, names).map(t => <li key={t} className="pl-3 border-l-2 border-forge">{t}</li>)}
              </ul>
            ) : <p className="mt-1 text-sm text-gray-500">No archive data for this pairing.</p>}

            {card && card.players[i].finishes.length > 0 && (
              <>
                <h3 className="mt-4 font-display uppercase tracking-wider text-xs text-gray-500">Finishes in the archive</h3>
                <table className="mt-1 w-full text-sm">
                  <tbody>
                    {card.players[i].finishes.map((f, j) => (
                      <tr key={j} className="border-b border-gray-200">
                        <td className="py-1 pr-2 text-gray-500 tabular-nums w-12">{f.year ?? ''}</td>
                        <td className="py-1 pr-2">{f.event}</td>
                        <td className="py-1 pr-2 whitespace-nowrap tabular-nums">{ordinal(f.rank)}{f.players ? ` of ${f.players}` : ''}</td>
                        <td className="py-1 text-xs uppercase tracking-wider text-forge-ink whitespace-nowrap">
                          {[f.side && 'Side event', f.tier === 'cut' && (f.topCutSize ? `Top ${f.topCutSize}` : 'Top cut'), f.tier === 'day2' && 'Day 2'].filter(Boolean).join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {p.decklist && (
              <>
                <h3 className="mt-4 font-display uppercase tracking-wider text-xs text-gray-500">Decklist</h3>
                <div className="mt-1 columns-2 text-sm leading-tight">
                  {parseDeckList(p.decklist).map(c => <div key={c.name} className="break-inside-avoid">{c.count} {c.name}</div>)}
                </div>
              </>
            )}
          </div>
        ))}

        <div className="lg:order-2 lg:border-x border-gray-200 lg:px-5">
          <h3 className="font-display uppercase tracking-wider text-xs text-gray-500">Head to head in the archive</h3>
          {card ? (
            <>
              <div className="mt-1 font-display text-4xl tabular-nums">{card.headToHead.wins[0]} – {card.headToHead.wins[1]}</div>
              <div className="text-sm text-gray-600">
                {card.headToHead.wins[0] === card.headToHead.wins[1]
                  ? (card.headToHead.wins[0] + card.headToHead.draws === 0 ? 'First meeting' : 'Series tied')
                  : `${names[card.headToHead.wins[0] > card.headToHead.wins[1] ? 0 : 1]} leads`}
                {card.headToHead.draws > 0 && ` · ${card.headToHead.draws} draw${card.headToHead.draws === 1 ? '' : 's'}`}
              </div>
              <div className="mt-2 space-y-2 text-sm">
                {card.headToHead.matches.map((m, j) => (
                  <div key={j}>
                    <div>{m.event}{m.year ? ` ${m.year}` : ''} · {m.phase}</div>
                    <div className="text-gray-600">{m.winner === null ? 'Draw' : `${names[m.winner]} won${m.score ? ` ${m.score}` : ''}`}</div>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="mt-1 text-sm text-gray-500">No pairing with archive data yet.</p>}

          {results && results.matches.length > 0 && (
            <>
              <h3 className="mt-6 font-display uppercase tracking-wider text-xs text-gray-500">
                {results.round} · {results.matches.filter(m => m.done).length} of {results.matches.length} reported
              </h3>
              <table className="mt-1 w-full text-sm">
                <tbody>
                  {results.matches.map((m, j) => (
                    <tr key={j} className={`border-b border-gray-200 ${onStream(m) ? 'bg-forge-soft' : ''}`}>
                      <td className="py-1 pr-2 text-gray-500 tabular-nums w-6">{m.table ?? ''}</td>
                      <td className={`py-1 pr-2 ${m.winner === 0 ? 'font-semibold' : m.winner === 1 ? 'text-gray-500' : ''}`}>{m.p1}</td>
                      <td className={`py-1 pr-2 ${m.winner === 1 ? 'font-semibold' : m.winner === 0 ? 'text-gray-500' : ''}`}>{m.bye ? 'Bye' : m.p2}</td>
                      <td className="py-1 text-right tabular-nums text-gray-500 whitespace-nowrap">{m.score ?? (m.bye ? '' : m.done ? 'Draw' : '…')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-gray-500 mt-1">From Play Hub, refreshed by the control panel</div>
            </>
          )}

          <h3 className="mt-6 font-display uppercase tracking-wider text-xs text-gray-500">Table</h3>
          <div className="mt-1 text-sm">
            {players.map((p, i) => <div key={i}>{p.name || `Player ${i + 1}`}: {p.lore} lore, {p.gameWins} game win{p.gameWins === 1 ? '' : 's'}</div>)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Follows the stream table live</div>
        </div>
      </div>

      {standings && (
        <div className="mt-8 border-t-2 border-gray-900 pt-3">
          <h3 className="font-display uppercase tracking-wider text-xs text-gray-500">Standings after {standings.round} · {standings.players} players</h3>
          <div className="mt-1 columns-2 lg:columns-4 gap-x-8 text-sm">
            {standings.rows.map(r => (
              <div key={r.rank} className={`flex gap-2 py-1 border-b border-gray-200 break-inside-avoid ${names.includes(r.name) ? 'font-semibold' : ''}`}>
                <span className="text-gray-500 tabular-nums w-6">{r.rank}</span>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="tabular-nums whitespace-nowrap">{r.record}</span>
                <span className="tabular-nums text-gray-500 w-6 text-right">{r.points ?? ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

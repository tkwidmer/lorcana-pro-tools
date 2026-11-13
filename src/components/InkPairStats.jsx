import { Fragment, useEffect, useMemo, useState } from 'react'
import { renderMetaShareImage, renderMatchupShareImage, renderBestOfShareImage, renderConversionShareImage, shareFilename } from '../lib/tournamentLookupShareImage'
import { ShareDownloadLink } from './ShareDownloadLink'
import { InkIcons } from './InkIcons'
import { inkPairMeta, inkPairMatrix, winRate, bestOfLeaders, bestRankByPair, playerInks, cutQualifiers, conversionFunnel } from '../lib/tournamentInks'
import { fetchAllStandings } from '../lib/tournamentApi'
import { ordinal } from '../lib/resultsArchive'
import { winrateCellColor, winrateTextColor } from '../lib/statColors'

const pct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)
const record = ({ wins, losses, draws }) => `${wins}-${losses}${draws ? `-${draws}` : ''}`
// Lift: a pair's conversion over the field's (1.25× = 25% better).
const liftText = (lift) => (lift == null ? '—' : `${lift.toFixed(2)}×`)
const liftColor = (lift) => (lift == null ? 'text-gray-400' : lift >= 1.1 ? 'text-green-700 font-semibold' : lift <= 0.9 ? 'text-red-600' : 'text-gray-700')

// Conversion through each of the event's cuts that has been decided (a DLC's
// Day 2 at 18 points, then its Top 8), from the standings of the round that
// decided it.
export function ConversionTab({ allMatches, structure }) {
  const cuts = useMemo(() => structure.cuts.filter((c) => c.fromRoundId), [structure])
  const roundIds = cuts.map((c) => c.fromRoundId).join(',')
  const [standingsByRound, setStandingsByRound] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.all(roundIds.split(',').map((id) => fetchAllStandings(id)))
      .then((lists) => { if (!cancelled) setStandingsByRound(lists) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [roundIds])

  const funnel = useMemo(
    () => standingsByRound && conversionFunnel(allMatches, cuts.map((c, i) => ({ label: c.label, ids: cutQualifiers(standingsByRound[i], c.cutoff) }))),
    [standingsByRound, allMatches, cuts],
  )
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!funnel) return <p className="text-sm text-gray-500">Loading the standings that decided each cut…</p>

  const labels = cuts.map((c) => c.label)
  const cutoffText = (c) => (c.cutoff.type === 'rank' ? `the top ${c.cutoff.value}` : `${c.cutoff.value}+ match points`)
  return (
    <div className="space-y-2">
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 pt-2" colSpan={2} />
                {labels.map((label) => (
                  <th key={label} colSpan={3} className="px-4 pt-2 text-center text-gray-700 border-l border-gray-200">{label}</th>
                ))}
              </tr>
              <tr>
                <th className="text-left px-4 py-2">Ink pair</th>
                <th className="text-right px-4 py-2">Day 1</th>
                {labels.map((label) => (
                  <Fragment key={label}>
                    <th className="text-right px-4 py-2 border-l border-gray-200">Players</th>
                    <th className="text-right px-4 py-2" title="Players who made this cut / the pair's players at the stage before">Conv.</th>
                    <th className="text-right px-4 py-2" title="The pair's conversion over the whole field's">vs field</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {funnel.rows.map((r) => (
                <tr key={r.key} className="border-t border-gray-100">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <InkIcons colors={r.inks} size={18} />
                      <span className="capitalize text-gray-900 font-medium">{r.inks.join(' / ')}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-900">{r.players}</td>
                  {r.stages.map((st, k) => (
                    <Fragment key={labels[k]}>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-900 border-l border-gray-100">{st.count}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-600">{pct(st.conversion)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${liftColor(st.lift)}`}>{liftText(st.lift)}</td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold">
              <tr>
                <td className="px-4 py-2 text-gray-700">Field</td>
                <td className="px-4 py-2 text-right font-mono text-gray-900">{funnel.field.players}</td>
                {funnel.field.stages.map((st, k) => (
                  <Fragment key={labels[k]}>
                    <td className="px-4 py-2 text-right font-mono text-gray-900 border-l border-gray-100">{st.count}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-600">{pct(st.conversion)}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700">1.00×</td>
                  </Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
          {cuts.map((c) => `${c.label} is ${cutoffText(c)}`).join('; ')}, read from the standings that decided it. Conv. is the share of a pair's players at the stage before who made the cut; vs field is that over the field's rate, so 1.25× converted 25% better. Players with no submitted deck are left out. Small pairs swing hard: a pair of 10 moves 10 points per player.
        </p>
      </div>
      <ShareDownloadLink render={(video) => renderConversionShareImage({ funnel, labels, structure, video })} filename={shareFilename(structure, 'conversion')} />
    </div>
  )
}

// The field by ink pair, from the players' submitted decks on Play Hub.
export function InkMetaTab({ allMatches, structure, standings }) {
  const rows = useMemo(() => inkPairMeta(allMatches), [allMatches])
  const bestRank = useMemo(() => bestRankByPair(standings, playerInks(allMatches)), [standings, allMatches])
  const players = rows.reduce((sum, r) => sum + r.players, 0)
  return (
    <div className="space-y-2">
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Ink pair</th>
                <th className="text-right px-4 py-2">Players</th>
                <th className="text-left px-4 py-2 w-1/3">Share</th>
                <th className="text-right px-4 py-2" title="Matches against other pairs; mirrors excluded">Record</th>
                <th className="text-right px-4 py-2">Win %</th>
                {standings && <th className="text-right px-4 py-2">Best rank</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-gray-100">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <InkIcons colors={r.inks} size={18} />
                      <span className="capitalize text-gray-900 font-medium">{r.inks.join(' / ')}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-900">{r.players}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded">
                        <div className="h-2 bg-forge rounded" style={{ width: `${r.share}%` }} />
                      </div>
                      <span className="text-xs font-mono text-gray-600 w-12 text-right">{pct(r.share)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-600">{record(r)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${winrateTextColor(r.winRate)}`}>{pct(r.winRate)}</td>
                  {standings && <td className="px-4 py-2.5 text-right font-mono text-gray-700">{bestRank.has(r.key) ? `#${bestRank.get(r.key)}` : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
          {players} players with a submitted deck. Win % counts reported matches against other pairs (draws as half), mirrors excluded.
        </p>
      </div>
      <ShareDownloadLink render={(video) => renderMetaShareImage({ matches: allMatches, structure, standings, video })} filename={shareFilename(structure, 'metagame')} />
    </div>
  )
}

// Row pair's win rate against each column pair.
export function InkMatrixTab({ allMatches, structure, standings }) {
  const pairs = useMemo(() => inkPairMeta(allMatches), [allMatches])
  const cells = useMemo(() => inkPairMatrix(allMatches), [allMatches])
  const bestRank = useMemo(() => bestRankByPair(standings, playerInks(allMatches)), [standings, allMatches])
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="text-xs border-separate border-spacing-0.5">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-gray-500 font-normal">Deck</th>
              <th className="px-2 py-1 text-right text-gray-500 font-normal">Win %</th>
              <th className="px-2 py-1 text-right text-gray-500 font-normal">Record</th>
              {standings && <th className="px-2 py-1 pr-4 text-right text-gray-500 font-normal">Best</th>}
              {pairs.map((p) => (
                <th key={p.key} className="px-1 py-1" title={p.inks.join(' / ')}>
                  <InkIcons colors={p.inks} size={16} className="justify-center" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pairs.map((row) => (
              <tr key={row.key}>
                <th className="px-2 py-1 text-left whitespace-nowrap" title={row.inks.join(' / ')}>
                  <span className="inline-flex items-center gap-1">
                    <InkIcons colors={row.inks} size={16} />
                    <span className="font-mono text-gray-400 font-normal">{row.players}</span>
                  </span>
                </th>
                <td className={`px-2 py-1 text-right font-mono font-semibold ${winrateTextColor(row.winRate)}`}>{pct(row.winRate)}</td>
                <td className="px-2 py-1 text-right font-mono text-gray-600 whitespace-nowrap">{record(row)}</td>
                {standings && <td className="px-2 py-1 pr-4 text-right font-mono text-gray-700">{bestRank.has(row.key) ? `#${bestRank.get(row.key)}` : '—'}</td>}
                {pairs.map((col) => {
                  const rec = cells.get(`${row.key}|${col.key}`)
                  const mirror = row.key === col.key
                  const wr = rec && winRate(rec)
                  const n = rec ? rec.wins + rec.losses + rec.draws : 0
                  return (
                    <td
                      key={col.key}
                      title={rec ? `${row.inks.join('/')} vs ${col.inks.join('/')}: ${record(rec)}` : undefined}
                      className={`w-14 h-10 text-center rounded ${
                        !rec ? 'bg-gray-50' : mirror ? 'bg-gray-100' : winrateCellColor(wr)
                      }`}
                    >
                      {rec && (
                        <>
                          <div className="font-mono font-semibold text-gray-900">{mirror ? '—' : `${Math.round(wr)}%`}</div>
                          <div className="text-[10px] text-gray-500">{n}</div>
                        </>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Win % and Record are each pair's matches against other pairs (mirrors left out); Best is its best standings rank. Each cell is the row pair's match win rate against the column pair, with the number of reported matches below. Draws count as half; the diagonal counts mirror matches. Small samples swing hard.
      </p>
      <ShareDownloadLink render={(video) => renderMatchupShareImage({ matches: allMatches, structure, standings, video })} filename={shareFilename(structure, 'matchups')} />
    </div>
  )
}

// "Best of" promo tracker: the best-ranked player on each of the 15 ink pairs,
// in standings order, so RPH's tiebreakers settle ties.
export function BestOfTab({ standings, inksById, allMatches, structure, standingsLabel }) {
  const rows = useMemo(() => bestOfLeaders(standings, inksById), [standings, inksById])
  const [open, setOpen] = useState(() => new Set())
  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev)
    if (!next.delete(key)) next.add(key)
    return next
  })
  return (
    <div className="space-y-2">
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Inks</th>
                <th className="text-left px-4 py-2">Player</th>
                <th className="text-right px-4 py-2">Standing</th>
                <th className="text-right px-4 py-2">Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.key}>
                  <tr className="border-t border-gray-100">
                    <td className="px-4 py-2.5" title={r.inks.join(' / ')}>
                      <InkIcons colors={r.inks} size={22} />
                    </td>
                    <td className={`px-4 py-2.5 ${r.entry ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                      {r.entry ? r.entry.user_event_status.best_identifier : 'No player yet'}
                      {r.tied.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggle(r.key)}
                          aria-expanded={open.has(r.key)}
                          className="ml-2 text-xs font-normal text-forge-ink hover:underline"
                        >
                          {open.has(r.key) ? '▾' : '▸'} {r.tied.length} more on {r.entry.match_points} pts
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700">{r.entry ? ordinal(r.entry.rank) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">{r.entry?.match_record ?? '—'}</td>
                  </tr>
                  {open.has(r.key) && r.tied.map((e) => (
                    <tr key={e.player.id} className="bg-gray-50 text-gray-600">
                      <td />
                      <td className="px-4 py-1.5 pl-8">{e.user_event_status.best_identifier}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{ordinal(e.rank)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{e.match_record}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
          The highest-standing player on each ink pair wins its Best Of promo; players tied on points are separated by RPH's tiebreakers. {standingsLabel}.
        </p>
      </div>
      <ShareDownloadLink render={(video) => renderBestOfShareImage({ matches: allMatches, structure, standings, standingsLabel, video })} filename={shareFilename(structure, 'best-of')} />
    </div>
  )
}

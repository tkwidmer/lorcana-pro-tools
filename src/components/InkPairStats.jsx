import { useMemo, useState } from 'react'
import { renderMetaShareImage, renderMatchupShareImage } from '../lib/inkPairShareImage'
import { downloadShareImage } from '../lib/tournamentShareImage'
import { InkIcons } from './InkIcons'
import { inkPairMeta, inkPairMatrix, winRate } from '../lib/tournamentInks'
import { winrateCellColor, winrateTextColor } from '../lib/statColors'

const pct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)
// "Download Social Media Share" under each tab: renders the PNG and saves it.
function ShareDownload({ render, allMatches, structure, name }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function download() {
    setBusy(true)
    setError(null)
    try {
      const canvas = await render({ matches: allMatches, structure })
      const slug = structure.eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      await downloadShareImage(canvas, `${slug}-${name}.png`, 'image/png')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <p className="text-sm">
      <button type="button" onClick={download} disabled={busy} className="text-forge-ink font-semibold underline decoration-dotted hover:decoration-solid disabled:opacity-50">
        {busy ? 'Rendering…' : 'Download Social Media Share'}
      </button>
      {error && <span className="ml-2 text-red-600">{error}</span>}
    </p>
  )
}

const record = ({ wins, losses, draws }) => `${wins}-${losses}${draws ? `-${draws}` : ''}`

// The field by ink pair, from the players' submitted decks on Play Hub.
export function InkMetaTab({ allMatches, structure }) {
  const rows = useMemo(() => inkPairMeta(allMatches), [allMatches])
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
          {players} players with a submitted deck. Win % counts reported matches against other pairs (draws as half), mirrors excluded.
        </p>
      </div>
      <ShareDownload render={renderMetaShareImage} allMatches={allMatches} structure={structure} name="metagame" />
    </div>
  )
}

// Row pair's win rate against each column pair.
export function InkMatrixTab({ allMatches, structure }) {
  const pairs = useMemo(() => inkPairMeta(allMatches), [allMatches])
  const cells = useMemo(() => inkPairMatrix(allMatches), [allMatches])
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="text-xs border-separate border-spacing-0.5">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-gray-500 font-normal">vs →</th>
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
        Each cell is the row pair's match win rate against the column pair, with the number of reported matches below. Draws count as half; the diagonal counts mirror matches. Small samples swing hard.
      </p>
      <ShareDownload render={renderMatchupShareImage} allMatches={allMatches} structure={structure} name="matchups" />
    </div>
  )
}

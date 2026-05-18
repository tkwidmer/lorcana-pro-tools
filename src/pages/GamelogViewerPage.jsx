import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { fetchGamelogBuffer, getToken } from '../lib/duelsApi'

async function decompressGzip(arrayBuffer) {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(arrayBuffer)
  writer.close()
  const chunks = []
  const reader = ds.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return new TextDecoder().decode(out)
}

function CardTable({ title, cards }) {
  if (!cards || cards.length === 0) return null
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="py-1.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Card</th>
            <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Drawn</th>
            <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Played</th>
            <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Inked</th>
            <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Discarded</th>
          </tr>
        </thead>
        <tbody>
          {cards.sort((a, b) => b.drawn - a.drawn || a.name.localeCompare(b.name)).map(card => (
            <tr key={card.name} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-1.5 pr-4 font-medium text-gray-800">{card.name}</td>
              <td className="py-1.5 pr-3 text-center text-gray-600">{card.drawn || '—'}</td>
              <td className="py-1.5 pr-3 text-center text-gray-600">{card.played || '—'}</td>
              <td className="py-1.5 pr-3 text-center text-gray-600">{card.inked || '—'}</td>
              <td className="py-1.5 pr-3 text-center text-gray-600">{card.discarded || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseGamelog(data) {
  // Handle both array-of-events and wrapped object formats
  const logs = Array.isArray(data) ? data : (data.logs ?? data.events ?? data.actions ?? [])
  const meta = Array.isArray(data) ? {} : data

  const players = { 1: {}, 2: {} }

  for (const entry of logs) {
    const p = entry.player ?? entry.playerNum ?? entry.playerId
    if (p !== 1 && p !== 2 && p !== '1' && p !== '2') continue
    const pKey = String(p) === '1' ? 1 : 2
    const type = entry.type ?? entry.eventType ?? entry.action

    const refs = entry.cardRefs ?? entry.cards ?? entry.card ? [entry.card] : []
    const names = refs.flatMap(r => {
      const name = r?.fullName ?? r?.name ?? r?.cardName
      return name ? [name] : []
    })

    for (const name of names) {
      if (!players[pKey][name]) players[pKey][name] = { name, drawn: 0, played: 0, inked: 0, discarded: 0 }
      if (type === 'CARD_DRAWN') players[pKey][name].drawn++
      else if (type === 'CARD_PLAYED') players[pKey][name].played++
      else if (type === 'CARD_INKED') players[pKey][name].inked++
      else if (type === 'CARD_DISCARDED') players[pKey][name].discarded++
    }
  }

  return {
    meta,
    logs,
    p1Cards: Object.values(players[1]),
    p2Cards: Object.values(players[2]),
    topLevelKeys: Object.keys(Array.isArray(data) ? {} : data),
    sampleEntry: logs[0] ?? null,
    eventTypes: [...new Set(logs.map(l => l.type ?? l.eventType ?? l.action).filter(Boolean))].sort(),
  }
}

export function GamelogViewerPage() {
  const [searchParams] = useSearchParams()
  const gameId = searchParams.get('id')
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [error, setError] = useState(null)
  const [parsed, setParsed] = useState(null)

  useEffect(() => {
    if (!gameId || !getToken()) return
    setStatus('loading')
    fetchGamelogBuffer(gameId)
      .then(buf => decompressGzip(buf))
      .then(text => {
        const data = JSON.parse(text)
        setParsed(parseGamelog(data))
        setStatus('done')
      })
      .catch(e => {
        setError(e.message)
        setStatus('error')
      })
  }, [gameId])

  if (!getToken()) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-sm text-gray-600">
        Add your duels.ink API token in <Link to="/settings" className="underline">Settings</Link> first.
      </div>
    )
  }

  if (!gameId) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-sm text-gray-600">
        No game ID specified.
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-8">
        <Link to="/match-history" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← Match History</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Gamelog</h1>
        <p className="text-xs text-gray-400 font-mono mt-0.5">{gameId}</p>
      </div>

      {status === 'loading' && <p className="text-sm text-gray-500">Fetching gamelog…</p>}

      {status === 'error' && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4 text-sm text-red-700">{error}</div>
      )}

      {status === 'done' && parsed && (
        <div className="space-y-10">
          {/* Card tables */}
          {(parsed.p1Cards.length > 0 || parsed.p2Cards.length > 0) ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <CardTable title="Player 1" cards={parsed.p1Cards} />
              <CardTable title="Player 2" cards={parsed.p2Cards} />
            </div>
          ) : (
            <p className="text-sm text-gray-500">No card events parsed — see raw structure below to check the format.</p>
          )}

          {/* Raw structure inspector */}
          <details className="border border-dashed border-gray-300 rounded-lg p-4 text-xs text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700 select-none">
              Raw structure inspector
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <span className="font-semibold text-gray-700">Top-level keys: </span>
                <span className="font-mono">{parsed.topLevelKeys.join(', ') || '(array)'}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Event types seen ({parsed.eventTypes.length}): </span>
                <span className="font-mono">{parsed.eventTypes.join(', ')}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Total log entries: </span>
                <span className="font-mono">{parsed.logs.length}</span>
              </div>
              {parsed.sampleEntry && (
                <div>
                  <div className="font-semibold text-gray-700 mb-1">First log entry:</div>
                  <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(parsed.sampleEntry, null, 2)}
                  </pre>
                </div>
              )}
              {parsed.meta && Object.keys(parsed.meta).length > 0 && (
                <div>
                  <div className="font-semibold text-gray-700 mb-1">Top-level metadata (non-logs fields):</div>
                  <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(
                      Object.fromEntries(Object.entries(parsed.meta).filter(([k]) => k !== 'logs' && k !== 'events' && k !== 'actions')),
                      null, 2
                    )}
                  </pre>
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

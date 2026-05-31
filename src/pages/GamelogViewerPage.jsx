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

// Extract card objects from a log entry's data field.
// Two formats exist:
//   - Single-card events (CARD_DRAWN, CARD_PLAYED, etc.): data.cardName + data.cardId
//   - Multi-card events (INITIAL_HAND, MULLIGAN): array fields with {id, name} objects
function extractCards(entry) {
  const d = entry.data ?? {}
  const result = []
  if (d.cardName) result.push({ name: d.cardName, id: d.cardId })
  for (const arr of [d.initialHandCards, d.mulliganedCards, d.drawnCards, d.cards, d.keptCards, d.returnedCards]) {
    if (Array.isArray(arr)) arr.forEach(c => { if (c?.name) result.push({ name: c.name, id: c.id }) })
  }
  return result
}

function parseGamelog(logs) {
  const players = {
    1: { initialHand: [], mulliganSent: [], mulliganKept: [], cards: {} },
    2: { initialHand: [], mulliganSent: [], mulliganKept: [], cards: {} },
  }
  let p1Name = 'Player 1'
  let p2Name = 'Player 2'
  let winner = null
  let turnCount = 0

  for (const entry of logs) {
    const p = entry.player === 1 || entry.player === '1' ? 1 : entry.player === 2 || entry.player === '2' ? 2 : null
    const type = entry.type
    const d = entry.data ?? {}

    if (entry.turnNumber > turnCount) turnCount = entry.turnNumber

    if (type === 'GAME_START') {
      if (d.playerNames) {
        p1Name = d.playerNames['1'] ?? d.playerNames.player1 ?? 'Player 1'
        p2Name = d.playerNames['2'] ?? d.playerNames.player2 ?? 'Player 2'
      }
      if (d.players) {
        p1Name = d.players[0]?.name ?? p1Name
        p2Name = d.players[1]?.name ?? p2Name
      }
    }

    if (type === 'GAME_END') {
      winner = d.winner ?? null
    }

    if (!p) continue
    const pData = players[p]

    if (type === 'INITIAL_HAND') {
      pData.initialHand = (d.initialHandCards ?? []).filter(c => c?.name)
    }

    if (type === 'MULLIGAN') {
      pData.mulliganSent = (d.mulliganedCards ?? []).filter(c => c?.name)
      // Kept = initial hand minus sent back; replacements tracked separately
      const sentIds = new Set(pData.mulliganSent.map(c => c.id))
      pData.mulliganKept = pData.initialHand.filter(c => !sentIds.has(c.id))
      pData.mulliganDrawn = (d.drawnCards ?? []).filter(c => c?.name)
    }

    const cards = extractCards(entry)
    for (const card of cards) {
      if (!card.name) continue
      if (!pData.cards[card.name]) {
        pData.cards[card.name] = { name: card.name, id: card.id, drawn: 0, played: 0, inked: 0, discarded: 0, destroyed: 0 }
      }
      const c = pData.cards[card.name]
      // TURN_DRAW is the public "draw happened" event with no card data — skip it
      if (type === 'CARD_DRAWN') c.drawn++
      else if (type === 'INITIAL_HAND' || type === 'MULLIGAN') { /* handled separately */ }
      else if (type === 'CARD_PLAYED') c.played++
      else if (type === 'CARD_INKED') c.inked++
      else if (type === 'CARD_DISCARDED') c.discarded++
      else if (type === 'CARD_DESTROYED') c.destroyed++
    }
  }

  const toList = (cardsMap) => Object.values(cardsMap).sort((a, b) => {
    const aTotal = a.drawn + a.played + a.inked
    const bTotal = b.drawn + b.played + b.inked
    return bTotal - aTotal || a.name.localeCompare(b.name)
  })

  return {
    p1Name, p2Name, winner, turnCount,
    p1: { ...players[1], mulliganDrawn: players[1].mulliganDrawn ?? [], cardList: toList(players[1].cards) },
    p2: { ...players[2], mulliganDrawn: players[2].mulliganDrawn ?? [], cardList: toList(players[2].cards) },
  }
}

// --- Components ---

function HandCards({ cards, label }) {
  if (!cards?.length) return null
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {cards.map((c, i) => (
          <span key={i} className="text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5">{c.name}</span>
        ))}
      </div>
    </div>
  )
}

function PlayerSection({ name, data, isWinner }) {
  const { initialHand, mulliganSent, mulliganKept, cardList } = data
  const { mulliganDrawn = [] } = data
  const tookMulligan = mulliganSent.length > 0

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-bold text-gray-900">{name}</h2>
        {isWinner && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">Winner</span>}
      </div>

      <div className="space-y-3 mb-5">
        <HandCards cards={initialHand} label="Opening hand" />
        {tookMulligan ? (
          <>
            <HandCards cards={mulliganSent} label="Sent back" />
            <HandCards cards={mulliganKept} label="Kept" />
            <HandCards cards={mulliganDrawn} label="Drew as replacements" />
          </>
        ) : initialHand.length > 0 ? (
          <div className="text-xs text-gray-400">Kept opening hand</div>
        ) : null}
      </div>

      {cardList.length > 0 && (
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-1.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Card</th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Drawn</th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Played</th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Inked</th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Discarded</th>
              <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Destroyed</th>
            </tr>
          </thead>
          <tbody>
            {cardList.map(card => (
              <tr key={card.name} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-1.5 pr-4 font-medium text-gray-800 text-sm">{card.name}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.drawn || '—'}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.played || '—'}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.inked || '—'}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.discarded || '—'}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.destroyed || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function GamelogViewerPage() {
  const [searchParams] = useSearchParams()
  const gameId = searchParams.get('id')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [rawLogs, setRawLogs] = useState(null)

  useEffect(() => {
    if (!gameId || !getToken()) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('loading')
    fetchGamelogBuffer(gameId)
      .then(buf => decompressGzip(buf))
      .then(text => {
        const logs = JSON.parse(text)
        setRawLogs(logs)
        setParsed(parseGamelog(logs))
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
      <div className="max-w-5xl mx-auto px-6 py-12 text-sm text-gray-600">No game ID specified.</div>
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
          <div className="text-sm text-gray-500">
            {parsed.turnCount} turns · {rawLogs?.length ?? 0} events
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <PlayerSection
              name={parsed.p1Name}
              data={parsed.p1}
              isWinner={parsed.winner === 1 || parsed.winner === '1'}
            />
            <PlayerSection
              name={parsed.p2Name}
              data={parsed.p2}
              isWinner={parsed.winner === 2 || parsed.winner === '2'}
            />
          </div>

          {/* Raw inspector for format verification */}
          <details className="border border-dashed border-gray-300 rounded-lg p-4 text-xs text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700 select-none">Raw structure inspector</summary>
            <div className="mt-3 space-y-3">
              <div>
                <span className="font-semibold text-gray-700">Event types ({[...new Set(rawLogs.map(l => l.type))].length}): </span>
                <span className="font-mono">{[...new Set(rawLogs.map(l => l.type))].sort().join(', ')}</span>
              </div>
              <div>
                <div className="font-semibold text-gray-700 mb-1">GAME_START entry (player names, setup):</div>
                <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(rawLogs.find(l => l.type === 'GAME_START') ?? 'none — no GAME_START event found', null, 2)}
                </pre>
              </div>
              <div>
                <div className="font-semibold text-gray-700 mb-1">GAME_END entry (winner, final lore):</div>
                <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(rawLogs.find(l => l.type === 'GAME_END') ?? 'none', null, 2)}
                </pre>
              </div>
              <div>
                <div className="font-semibold text-gray-700 mb-1">First CARD_DRAWN entry:</div>
                <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(rawLogs.find(l => l.type === 'CARD_DRAWN') ?? 'none — no CARD_DRAWN events found', null, 2)}
                </pre>
              </div>
              <div>
                <div className="font-semibold text-gray-700 mb-1">First MULLIGAN entry:</div>
                <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(rawLogs.find(l => l.type === 'MULLIGAN') ?? 'none', null, 2)}
                </pre>
              </div>
              <div>
                <div className="font-semibold text-gray-700 mb-1">First 3 raw entries (top-level structure):</div>
                <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(rawLogs.slice(0, 3), null, 2)}
                </pre>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

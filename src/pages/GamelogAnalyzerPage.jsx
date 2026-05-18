import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveGamelog, getAllGamelogs, deleteGamelog } from '../lib/gamelogHistory'

// --- Parsing helpers ---

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

function extractCards(entry) {
  const d = entry.data ?? {}
  const result = []
  if (d.cardName) result.push({ name: d.cardName, id: d.cardId })
  for (const arr of [d.initialHandCards, d.mulliganedCards, d.drawnCards, d.cards, d.keptCards, d.returnedCards]) {
    if (Array.isArray(arr)) arr.forEach(c => { if (c?.name) result.push({ name: c.name, id: c.id }) })
  }
  return result
}

function parseGamelog(id, logs) {
  const players = {
    1: { initialHand: [], mulliganSent: [], mulliganKept: [], mulliganDrawn: [], cards: {} },
    2: { initialHand: [], mulliganSent: [], mulliganKept: [], mulliganDrawn: [], cards: {} },
  }
  let p1Name = 'Player 1'
  let p2Name = 'Player 2'
  let winner = null
  let turnCount = 0
  let p1FinalLore = null
  let p2FinalLore = null

  for (const entry of logs) {
    const p = entry.player === 1 || entry.player === '1' ? 1 : entry.player === 2 || entry.player === '2' ? 2 : null
    const type = entry.type
    const d = entry.data ?? {}

    if (entry.turnNumber > turnCount) turnCount = entry.turnNumber

    if (type === 'GAME_START') {
      if (d.playerNames) {
        p1Name = d.playerNames['1'] ?? d.playerNames.player1 ?? p1Name
        p2Name = d.playerNames['2'] ?? d.playerNames.player2 ?? p2Name
      }
      if (Array.isArray(d.players)) {
        p1Name = d.players[0]?.name ?? p1Name
        p2Name = d.players[1]?.name ?? p2Name
      }
    }

    if (type === 'GAME_END') {
      winner = d.winner ?? null
      p1FinalLore = d.p1Lore ?? d.lore?.['1'] ?? null
      p2FinalLore = d.p2Lore ?? d.lore?.['2'] ?? null
    }

    if (!p) continue
    const pData = players[p]

    if (type === 'INITIAL_HAND') {
      pData.initialHand = (d.initialHandCards ?? []).filter(c => c?.name)
    }

    if (type === 'MULLIGAN') {
      pData.mulliganSent = (d.mulliganedCards ?? []).filter(c => c?.name)
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
      if (type === 'CARD_DRAWN') c.drawn++
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
    id,
    p1Name,
    p2Name,
    winner,
    turnCount,
    eventCount: logs.length,
    p1FinalLore,
    p2FinalLore,
    p1: { ...players[1], cardList: toList(players[1].cards) },
    p2: { ...players[2], cardList: toList(players[2].cards) },
  }
}

// --- Sub-components ---

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

function PlayerSection({ name, data, isWinner, finalLore }) {
  const { initialHand, mulliganSent, mulliganKept, cardList } = data
  const mulliganDrawn = data.mulliganDrawn ?? []
  const tookMulligan = mulliganSent.length > 0

  const anyDiscarded = cardList.some(c => c.discarded > 0)
  const anyDestroyed = cardList.some(c => c.destroyed > 0)

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h2 className="text-base font-bold text-gray-900">{name}</h2>
        {isWinner && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">Winner</span>}
        {finalLore != null && <span className="text-xs text-gray-500">{finalLore} lore</span>}
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
              {anyDiscarded && <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Discarded</th>}
              {anyDestroyed && <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Destroyed</th>}
            </tr>
          </thead>
          <tbody>
            {cardList.map(card => (
              <tr key={card.name} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-1.5 pr-4 font-medium text-gray-800 text-sm">{card.name}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.drawn || '—'}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.played || '—'}</td>
                <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.inked || '—'}</td>
                {anyDiscarded && <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.discarded || '—'}</td>}
                {anyDestroyed && <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.destroyed || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function GamelogDetail({ gamelog }) {
  const { p1Name, p2Name, winner, turnCount, eventCount, p1FinalLore, p2FinalLore, p1, p2 } = gamelog
  const p1IsWinner = winner === 1 || winner === '1'
  const p2IsWinner = winner === 2 || winner === '2'

  return (
    <div className="mt-8">
      <div className="border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h2 className="text-lg font-bold text-gray-900">{p1Name} vs {p2Name}</h2>
          {winner != null && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">
              {p1IsWinner ? p1Name : p2IsWinner ? p2Name : 'Unknown'} wins
            </span>
          )}
        </div>
        <div className="text-sm text-gray-500">{turnCount} turns · {eventCount} events</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <PlayerSection
          name={p1Name}
          data={p1}
          isWinner={p1IsWinner}
          finalLore={p1FinalLore}
        />
        <PlayerSection
          name={p2Name}
          data={p2}
          isWinner={p2IsWinner}
          finalLore={p2FinalLore}
        />
      </div>
    </div>
  )
}

// --- Main page ---

export function GamelogAnalyzerPage() {
  const navigate = useNavigate()
  const [gamelogs, setGamelogs] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const activeGamelog = gamelogs.find(g => g.id === activeId) ?? null

  async function processBuffer(arrayBuffer, filename) {
    const text = await decompressGzip(arrayBuffer)
    const logs = JSON.parse(text)
    // Extract UUID from filename: e.g. "abc123.logs.gz" → "abc123"
    const id = filename.replace(/\.logs\.gz$/i, '').replace(/\.gz$/i, '') || crypto.randomUUID()
    const parsed = parseGamelog(id, logs)
    const record = await saveGamelog(id, parsed)
    setGamelogs(prev => {
      const filtered = prev.filter(g => g.id !== id)
      return [record, ...filtered].sort((a, b) => b.savedAt - a.savedAt)
    })
    setActiveId(id)
    return record
  }

  async function processFiles(files) {
    setLoading(true)
    setError(null)
    try {
      for (const file of files) {
        if (!file.name.endsWith('.gz')) continue
        const buf = await file.arrayBuffer()
        await processBuffer(buf, file.name)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getAllGamelogs().then(all => {
      setGamelogs(all)
    }).catch(() => {})

    // Check sessionStorage for a pending gamelog (e.g. sent from Match History)
    const pending = sessionStorage.getItem('lorcana_pending_gamelog')
    if (pending) {
      sessionStorage.removeItem('lorcana_pending_gamelog')
      try {
        const { base64, filename } = JSON.parse(pending)
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        setLoading(true)
        processBuffer(bytes.buffer, filename).catch(e => setError(e.message)).finally(() => setLoading(false))
      } catch (e) {
        setError(e.message)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(id) {
    await deleteGamelog(id)
    setGamelogs(prev => prev.filter(g => g.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) processFiles(files)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Gamelog Analyzer</h1>
        <p className="text-sm text-gray-500">Import .logs.gz files or use the ↗ Gamelog button from Match History.</p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}
      >
        <label className="cursor-pointer flex flex-col items-center gap-2">
          <input
            type="file"
            accept=".gz"
            multiple
            className="sr-only"
            onChange={e => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) processFiles(files)
              e.target.value = ''
            }}
          />
          <span className="text-sm text-gray-600">Drop .logs.gz files here or click to upload</span>
          <span className="text-xs text-gray-400">Accepts .logs.gz files · duplicates are skipped</span>
        </label>
      </div>

      {loading && <div className="mt-4 text-sm text-gray-500">Parsing gamelogs…</div>}
      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

      {/* Saved list */}
      {gamelogs.length > 0 && (
        <div className="mt-6 space-y-1">
          {gamelogs.map(g => (
            <div
              key={g.id}
              onClick={() => setActiveId(g.id)}
              className={`cursor-pointer flex items-center gap-3 px-3 py-2 rounded transition-colors ${activeId === g.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}
            >
              <span className="font-medium text-sm">{g.p1Name} vs {g.p2Name}</span>
              <span className="text-xs opacity-60">{g.turnCount} turns · {g.eventCount} events</span>
              <span className="ml-auto text-xs opacity-60">{new Date(g.savedAt).toLocaleDateString()}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(g.id) }}
                className="text-xs opacity-40 hover:opacity-100 transition-opacity"
                title="Delete gamelog"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Detail view */}
      {activeGamelog && <GamelogDetail gamelog={activeGamelog} />}

      {gamelogs.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400 text-sm">No gamelogs yet — import a .logs.gz file to get started.</div>
      )}
    </div>
  )
}

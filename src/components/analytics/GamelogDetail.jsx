import { replayViewerUrl } from '../../lib/analyticsAggregation'
import { GameLeaks } from './LeakReport'

// --- Individual game view ---

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
  const anyLore = cardList.some(c => (c.loreGained ?? 0) > 0)

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
              {anyLore && <th className="py-1.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Lore</th>}
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
                {anyLore && <td className="py-1.5 pr-3 text-center text-gray-600 text-sm">{card.loreGained || '—'}</td>}
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

function LoreChart({ loreEvents, turnCount, p1Name, p2Name }) {
  if (!loreEvents?.length) return null

  const maxTurn = Math.max(turnCount, ...loreEvents.map(e => e.turn))
  const p1Lore = new Array(maxTurn + 1).fill(0)
  const p2Lore = new Array(maxTurn + 1).fill(0)

  for (const ev of loreEvents) {
    if (ev.player === 1) p1Lore[ev.turn] = ev.total
    else p2Lore[ev.turn] = ev.total
  }
  for (let t = 1; t <= maxTurn; t++) {
    if (p1Lore[t] === 0 && p1Lore[t - 1] > 0) p1Lore[t] = p1Lore[t - 1]
    if (p2Lore[t] === 0 && p2Lore[t - 1] > 0) p2Lore[t] = p2Lore[t - 1]
  }

  const maxLore = Math.max(20, ...p1Lore, ...p2Lore)
  const W = 480, H = 120, PAD = { top: 8, right: 8, bottom: 20, left: 28 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const turns = Array.from({ length: maxTurn + 1 }, (_, i) => i)

  const x = (t) => PAD.left + (t / maxTurn) * chartW
  const y = (v) => PAD.top + chartH - (v / maxLore) * chartH

  const pathFor = (arr) => arr.map((v, t) => `${t === 0 ? 'M' : 'L'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  const winY = y(20)

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Lore Race</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 140 }}>
        {[0, 5, 10, 15, 20].map(v => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth="0.5" />
            <text x={PAD.left - 4} y={y(v) + 3.5} textAnchor="end" fontSize="7" fill="#9ca3af">{v}</text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={winY} y2={winY} stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />

        <path d={pathFor(p2Lore)} fill="none" stroke="#f87171" strokeWidth="2" strokeLinejoin="round" />
        <path d={pathFor(p1Lore)} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />

        {turns.filter(t => t > 0 && t % Math.max(1, Math.floor(maxTurn / 8)) === 0).map(t => (
          <text key={t} x={x(t)} y={H - 4} textAnchor="middle" fontSize="7" fill="#9ca3af">{t}</text>
        ))}
        <text x={PAD.left + chartW / 2} y={H - 4} textAnchor="middle" fontSize="7" fill="#d1d5db">turn</text>
      </svg>
      <div className="flex items-center gap-4 mt-1">
        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="inline-block w-3 h-0.5 bg-blue-400" />{p1Name}</span>
        <span className="flex items-center gap-1 text-xs text-gray-500"><span className="inline-block w-3 h-0.5 bg-red-400" />{p2Name}</span>
        <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto"><span className="inline-block w-3 h-0.5 border-t border-dashed border-emerald-500" />win (20)</span>
      </div>
    </div>
  )
}

function GameChallengeLog({ challenges, myPlayerNum }) {
  if (!challenges?.length) return null
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Challenges ({challenges.length})</h3>
      <div className="space-y-0.5 text-xs font-mono">
        {challenges.map((c, i) => {
          const isMe = c.player === myPlayerNum
          return (
            <div key={i} className={`flex items-center gap-2 py-1 border-b border-gray-100 last:border-0 ${isMe ? '' : 'opacity-60'}`}>
              <span className="text-gray-400 w-12 flex-shrink-0">T{c.turn} {isMe ? '▶' : '◀'}</span>
              <span className="font-medium text-gray-800 truncate flex-1">{c.attackerName ?? '?'}</span>
              <span className="text-gray-400">→</span>
              <span className="text-gray-700 truncate flex-1">{c.defenderName ?? '?'}</span>
              <span className={`flex-shrink-0 font-semibold ${c.defenderBanished ? 'text-emerald-600' : 'text-gray-400'}`}>
                {c.defenderBanished ? 'kill' : 'miss'}
              </span>
              <span className={`flex-shrink-0 ${c.attackerBanished ? 'text-red-400' : 'text-gray-400'}`}>
                {c.attackerBanished ? '✕' : '✓'}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1">▶ = your challenge · ▶ kill = defender banished · ✕ = attacker banished</p>
    </div>
  )
}

function OppDecklistView({ oppDecklist, isInferred, oppCards }) {
  const seen = new Set()
  const rows = []

  if (oppDecklist?.length) {
    for (const { cardId, count } of oppDecklist) {
      if (!seen.has(cardId)) {
        seen.add(cardId)
        const name = Object.values(oppCards ?? {}).find(c => c.id === cardId)?.name ?? cardId
        rows.push({ cardId, name, count, seen: Object.values(oppCards ?? {}).find(c => c.id === cardId) != null })
      }
    }
  }

  for (const card of Object.values(oppCards ?? {})) {
    if (!rows.find(r => r.name === card.name)) {
      rows.push({ cardId: card.id, name: card.name, count: null, seen: true })
    }
  }

  if (!rows.length) return null

  rows.sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Opponent Decklist</h3>
        {isInferred && <span className="text-[10px] text-gray-400">(inferred from gamelog — counts are minimums)</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 text-xs font-mono">
        {rows.map(r => (
          <div key={r.cardId} className={`flex items-center gap-1.5 py-0.5 border-b border-gray-50 ${r.seen ? 'text-gray-800' : 'text-gray-400'}`}>
            <span className="w-5 text-right flex-shrink-0 font-semibold">{isInferred && r.count != null ? `≥${r.count}` : (r.count ?? '?')}</span>
            <span className="truncate">{r.name}</span>
            {r.seen && <span className="text-emerald-500 flex-shrink-0 ml-auto">●</span>}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-1">● = observed in game</p>
    </div>
  )
}

function resolveDisplayName(storedName, isMe, myName) {
  if (storedName !== 'Player 1' && storedName !== 'Player 2') return storedName
  if (isMe && myName) return myName
  return storedName
}

function RawStructureInspector({ rawLogs }) {
  if (!rawLogs || rawLogs.length === 0) return null

  const gameStart = rawLogs.find(l => l.type === 'GAME_START')
  const gameEnd = rawLogs.find(l => l.type === 'GAME_END')
  const firstCardDrawn = rawLogs.find(l => l.type === 'CARD_DRAWN')
  const firstMulligan = rawLogs.find(l => l.type === 'MULLIGAN')
  const firstThree = rawLogs.slice(0, 3)

  const uniqueTypes = [...new Set(rawLogs.map(l => l.type))].sort()

  const copyRawLog = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(rawLogs))
    } catch {
      // Clipboard blocked — fall through to the download button instead.
    }
  }

  const downloadRawLog = () => {
    const blob = new Blob([JSON.stringify(rawLogs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gamelog-raw.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <details className="border border-dashed border-gray-300 rounded-lg p-4 text-xs text-gray-600 mb-6">
      <summary className="cursor-pointer font-medium text-gray-700 select-none">Raw structure inspector</summary>
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-700">Full raw log ({rawLogs.length} events):</span>
          <button
            onClick={copyRawLog}
            className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900 transition-colors"
          >Copy JSON</button>
          <button
            onClick={downloadRawLog}
            className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900 transition-colors"
          >Download .json</button>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Event types ({uniqueTypes.length}): </span>
          <span className="font-mono">{uniqueTypes.join(', ')}</span>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">GAME_START entry (player names, setup):</div>
          <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(gameStart ?? 'none — no GAME_START event found', null, 2)}
          </pre>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">GAME_END entry (winner, final lore):</div>
          <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(gameEnd ?? 'none', null, 2)}
          </pre>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">First CARD_DRAWN entry:</div>
          <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(firstCardDrawn ?? 'none — no CARD_DRAWN events found', null, 2)}
          </pre>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">First MULLIGAN entry:</div>
          <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(firstMulligan ?? 'none', null, 2)}
          </pre>
        </div>
        <div>
          <div className="font-semibold text-gray-700 mb-1">First 3 raw entries (top-level structure):</div>
          <pre className="bg-gray-50 rounded p-2 overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(firstThree, null, 2)}
          </pre>
        </div>
      </div>
    </details>
  )
}

function TurnByTurnLog({ rawLogs, turnCount }) {
  if (!rawLogs || rawLogs.length === 0) return null

  const eventsByTurn = {}
  for (let i = 1; i <= (turnCount || 20); i++) {
    eventsByTurn[i] = []
  }
  for (const log of rawLogs) {
    const turn = log.turnNumber ?? 0
    if (turn > 0) {
      if (!eventsByTurn[turn]) eventsByTurn[turn] = []
      eventsByTurn[turn].push(log)
    }
  }

  const turns = Object.entries(eventsByTurn).filter(([, events]) => events.length > 0)

  if (turns.length === 0) return null

  return (
    <div className="border border-gray-100 rounded-lg p-4 mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Turn-by-Turn Events</h3>
      <div className="space-y-2">
        {turns.map(([turn, events]) => (
          <details key={turn} className="border border-gray-200 rounded p-2">
            <summary className="cursor-pointer font-medium text-sm text-gray-700 select-none">
              Turn {turn} ({events.length} events)
            </summary>
            <div className="mt-2 space-y-1">
              {events.map((event, idx) => (
                <div key={idx} className="text-xs text-gray-600 ml-2 py-0.5 border-l-2 border-gray-200 pl-2">
                  <span className="font-semibold text-gray-700">{event.type}</span>
                  {event.player && <span className="text-gray-500"> (P{event.player})</span>}
                  {event.data?.cardName && <span className="text-gray-700 font-mono"> — {event.data.cardName}</span>}
                  {event.data?.loreGained && <span className="text-emerald-600"> +{event.data.loreGained} lore</span>}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

function CardEffectsTimeline({ p1, p2, p1Name, p2Name, turnCount }) {
  if (!turnCount || ((!p1?.cards || Object.keys(p1.cards).length === 0) && (!p2?.cards || Object.keys(p2.cards).length === 0))) {
    return null
  }

  const renderPlayerTimeline = (player, playerName) => {
    if (!player?.cards || Object.keys(player.cards).length === 0) return null

    const cardsArray = Object.values(player.cards)

    const turnsPerCard = {}
    for (const card of cardsArray) {
      turnsPerCard[card.name] = {
        drawn: Math.ceil((card.drawn || 0) / Math.max(turnCount / 3, 1)),
        played: Math.ceil((card.played || 0) / Math.max(turnCount / 3, 1)),
        inked: Math.ceil((card.inked || 0) / Math.max(turnCount / 3, 1)),
      }
    }

    return (
      <div key={playerName} className="mb-4">
        <h4 className="text-xs font-semibold text-gray-600 mb-2">{playerName}</h4>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {cardsArray.slice(0, 10).map(card => (
            <div key={card.name} className="text-xs text-gray-700">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="truncate font-medium flex-1">{card.name}</span>
              </div>
              <div className="flex gap-2 text-[11px]">
                {card.drawn > 0 && <span className="text-blue-600">↓{card.drawn}</span>}
                {card.played > 0 && <span className="text-amber-600">▶{card.played}</span>}
                {card.inked > 0 && <span className="text-purple-600">◆{card.inked}</span>}
                {card.discarded > 0 && <span className="text-gray-500">✕{card.discarded}</span>}
              </div>
            </div>
          ))}
          {cardsArray.length > 10 && (
            <div className="text-xs text-gray-400 mt-2">+{cardsArray.length - 10} more cards</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-100 rounded-lg p-4 mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Card Effects Timeline</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderPlayerTimeline(p1, p1Name)}
        {renderPlayerTimeline(p2, p2Name)}
      </div>
      <div className="text-[11px] text-gray-500 mt-2 space-y-0.5">
        <div>↓ = Drawn · ▶ = Played · ◆ = Inked · ✕ = Discarded</div>
      </div>
    </div>
  )
}

export function GamelogDetail({ gamelog, myPlayerNum, myName = '' }) {
  const { p1Name: rawP1Name, p2Name: rawP2Name, winner, turnCount, p1FinalLore, p2FinalLore, p1, p2, victoryReason, wentFirst, loreEvents, challenges, oppDecklist, inferredOppDecklist, savedAt, _rawLogs } = gamelog
  const p1Name = resolveDisplayName(rawP1Name, myPlayerNum === 1, myName)
  const p2Name = resolveDisplayName(rawP2Name, myPlayerNum === 2, myName)
  const p1IsWinner = winner === 1 || winner === '1'
  const p2IsWinner = winner === 2 || winner === '2'
  const winnerName = p1IsWinner ? p1Name : p2IsWinner ? p2Name : null
  const myWon = myPlayerNum != null && (winner === myPlayerNum || winner === String(myPlayerNum))

  const metaBits = []
  if (gamelog.deckName) metaBits.push(gamelog.deckName)
  if (gamelog.match_format === 'bo3' && gamelog.match_game_number) {
    metaBits.push(`Game ${gamelog.match_game_number} of BO3`)
  }
  if (turnCount) metaBits.push(`${turnCount} turns`)
  if (wentFirst != null) {
    const firstName = wentFirst === 1 ? p1Name : p2Name
    metaBits.push(`${firstName} went first`)
  }
  if (victoryReason && victoryReason !== 'normal') metaBits.push(victoryReason)
  const displayTime = gamelog.playedAt ?? savedAt
  if (displayTime) metaBits.push(new Date(displayTime).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }))

  const oppP = myPlayerNum === 1 ? p2 : myPlayerNum === 2 ? p1 : null

  return (
    <div className="mt-2">
      <div className="border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h2 className="text-lg font-bold text-gray-900">{p1Name} vs {p2Name}</h2>
          {winnerName && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">
              {winnerName} wins
            </span>
          )}
          {myPlayerNum != null && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${myWon ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
              {myWon ? 'Win' : 'Loss'}
            </span>
          )}
          {gamelog.replay_url && (
            <a
              href={replayViewerUrl(gamelog.replay_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
            >
              ↗ Watch Replay
            </a>
          )}
        </div>
        <div className="text-sm text-gray-500">{metaBits.join(' · ')}</div>
      </div>

      {/* Raw structure inspector */}
      <RawStructureInspector rawLogs={_rawLogs} />

      {/* Lore Race */}
      {loreEvents?.length > 0 && (
        <div className="border border-gray-100 rounded-lg p-4 mb-6">
          <LoreChart loreEvents={loreEvents} turnCount={turnCount} p1Name={p1Name} p2Name={p2Name} />
        </div>
      )}

      {/* Turn-by-Turn Log */}
      <TurnByTurnLog rawLogs={_rawLogs} turnCount={turnCount} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div>
          {myPlayerNum === 1 && (
            <div className="inline-flex items-center text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded mb-2">You</div>
          )}
          <PlayerSection name={p1Name} data={p1} isWinner={p1IsWinner} finalLore={p1FinalLore} />
        </div>
        <div>
          {myPlayerNum === 2 && (
            <div className="inline-flex items-center text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded mb-2">You</div>
          )}
          <PlayerSection name={p2Name} data={p2} isWinner={p2IsWinner} finalLore={p2FinalLore} />
        </div>
      </div>

      {/* Leaks this game */}
      <GameLeaks gamelog={gamelog} myPlayerNum={myPlayerNum} />

      {/* Card Effects Timeline */}
      <CardEffectsTimeline p1={p1} p2={p2} p1Name={p1Name} p2Name={p2Name} turnCount={turnCount} />

      {/* Challenge log */}
      {challenges?.length > 0 && (
        <div className="mt-8 border border-gray-100 rounded-lg p-4">
          <GameChallengeLog challenges={challenges} myPlayerNum={myPlayerNum} />
        </div>
      )}

      {/* Opponent decklist */}
      {((oppDecklist ?? inferredOppDecklist)?.length > 0 || (oppP && Object.keys(oppP.cards ?? {}).length > 0)) && (
        <div className="mt-6 border border-gray-100 rounded-lg p-4">
          <OppDecklistView
            oppDecklist={oppDecklist ?? inferredOppDecklist}
            isInferred={!oppDecklist && !!inferredOppDecklist}
            oppCards={oppP?.cards}
          />
        </div>
      )}
    </div>
  )
}

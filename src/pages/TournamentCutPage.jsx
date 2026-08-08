import { useState, useMemo } from 'react'
import { StatCard } from '../components/StatCard'
import { estimateCutlineRange, cutlineLabel } from '../lib/tournamentCut'

function Stepper({ label, value, onChange, disabled }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={disabled || value === 0}
          className="w-10 h-10 rounded-full border border-gray-200 text-lg hover:border-gray-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          −
        </button>
        <span className="text-3xl font-bold w-10 text-center tabular-nums">{value}</span>
        <button
          onClick={() => onChange(value + 1)}
          disabled={disabled}
          className="w-10 h-10 rounded-full border border-gray-200 text-lg hover:border-gray-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>
    </div>
  )
}

function StatItem({ label, value, muted }) {
  return <StatCard size="centered" label={label} value={value} muted={muted} />
}

const VERDICT_STYLES = {
  green:  { card: 'border-green-200 bg-green-50',   heading: 'text-green-800' },
  yellow: { card: 'border-yellow-200 bg-yellow-50', heading: 'text-yellow-800' },
  orange: { card: 'border-orange-200 bg-orange-50', heading: 'text-orange-800' },
  red:    { card: 'border-red-200 bg-red-50',       heading: 'text-red-800' },
}

export function TournamentCutPage() {
  const [players, setPlayers] = useState('')
  const [rounds, setRounds] = useState('')
  const [topCut, setTopCut] = useState('8')
  const [fieldDraws, setFieldDraws] = useState('')
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [draws, setDraws] = useState(0)

  const N = parseInt(players) || 0
  const R = parseInt(rounds) || 0
  const T = parseInt(topCut) || 0
  const fieldDrawCount = fieldDraws !== '' ? parseInt(fieldDraws) || 0 : null

  const roundsPlayed = wins + losses + draws
  const roundsRemaining = Math.max(0, R - roundsPlayed)
  const currentPoints = wins * 3 + draws
  const setupValid = N >= 2 && R >= 1 && T >= 1 && T < N
  const recordValid = roundsPlayed <= R

  const analysis = useMemo(() => {
    if (!setupValid || !recordValid) return null

    const pointsIfDrawOut = currentPoints + roundsRemaining
    const pointsIfWinOut  = currentPoints + roundsRemaining * 3
    const { lower, upper } = estimateCutlineRange(N, R, T, fieldDrawCount)
    const range = cutlineLabel({ lower, upper })

    // marginUpper: gap between draw-out score and the pessimistic (no-ID) cutline.
    // marginLower: gap between draw-out score and the optimistic (ID-heavy) cutline.
    const marginUpper = pointsIfDrawOut - upper
    const marginLower = pointsIfDrawOut - lower

    let status, color, detail

    if (roundsRemaining === 0) {
      if (currentPoints > upper) {
        status = 'Likely in top cut'
        color = 'green'
        detail = `${currentPoints} pts is above the estimated cutline range of ${range}`
      } else if (currentPoints >= lower) {
        status = 'On the bubble'
        color = 'yellow'
        detail = `${currentPoints} pts falls within the estimated cutline range of ${range} — tiebreakers and how many IDs happened will decide`
      } else {
        status = 'Likely missed cut'
        color = 'red'
        detail = `${currentPoints} pts is below the estimated cutline range of ${range}`
      }
    } else {
      if (marginUpper >= 3) {
        // Above even the pessimistic (no-ID) cutline with room to spare — definitely safe.
        status = 'Safe to ID'
        color = 'green'
        detail = `Drawing out projects to ${pointsIfDrawOut} pts — safely above the estimated cutline range of ${range}`
      } else if (marginUpper >= 0) {
        // Above the pessimistic cutline but not by much — likely safe.
        status = 'Probably safe to ID'
        color = 'yellow'
        detail = `Drawing out projects to ${pointsIfDrawOut} pts — above the no-ID estimate of ~${upper} pts, and IDs in the field tend to push the cutline lower`
      } else if (marginLower >= 0) {
        // Below the pessimistic cutline but at or above the optimistic one — depends on how many IDs happen.
        status = 'Risky ID — field dependent'
        color = 'yellow'
        detail = `Drawing out projects to ${pointsIfDrawOut} pts — within the estimated cutline range of ${range}. Safe only if IDs are common in the field`
      } else if (pointsIfWinOut > lower) {
        // Even winning out only gets you to the lower part of the range.
        status = 'Play it out'
        color = 'orange'
        detail = `Drawing out leaves you at ${pointsIfDrawOut} pts, below the estimated cutline range of ${range}`
      } else if (pointsIfWinOut === lower) {
        status = 'Win out and hope'
        color = 'red'
        detail = `Even winning out only gets you to ${pointsIfWinOut} pts — the floor of the estimated cutline range of ${range}`
      } else {
        status = 'Eliminated from contention'
        color = 'red'
        detail = `Winning out only reaches ${pointsIfWinOut} pts, below even the optimistic cutline estimate of ~${lower} pts`
      }
    }

    return { pointsIfDrawOut, pointsIfWinOut, lower, upper, range, roundsRemaining, currentPoints, status, color, detail }
  }, [N, R, T, fieldDrawCount, setupValid, recordValid, currentPoints, roundsRemaining])

  const recordOverflow = R > 0 && roundsPlayed > R

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="max-w-lg">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
          Cut Calculator
        </h1>
        <p className="text-gray-500">
          Know when it's safe to intentional draw.
        </p>
      </div>

      {/* Tournament Setup */}
      <div className="border border-gray-200 rounded-lg p-6 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
          Tournament Setup
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Players</label>
            <input
              type="number"
              min="2"
              inputMode="numeric"
              value={players}
              onChange={e => setPlayers(e.target.value)}
              placeholder="32"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Swiss Rounds</label>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={rounds}
              onChange={e => setRounds(e.target.value)}
              placeholder="6"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Top Cut</label>
            <select
              value={topCut}
              onChange={e => setTopCut(e.target.value)}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-900 bg-white"
            >
              <option value="4">Top 4</option>
              <option value="8">Top 8</option>
              <option value="16">Top 16</option>
              <option value="32">Top 32</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">
            Players with draws <span className="text-gray-400">(optional — from standings)</span>
          </label>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={fieldDraws}
            onChange={e => setFieldDraws(e.target.value)}
            placeholder="0"
            className="w-28 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
          />
        </div>
      </div>

      {/* Your Record */}
      <div className="border border-gray-200 rounded-lg p-6 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-5">
          Your Record
        </h2>
        <div className="flex justify-around">
          <Stepper label="Wins"   value={wins}   onChange={setWins}   disabled={!setupValid} />
          <Stepper label="Losses" value={losses} onChange={setLosses} disabled={!setupValid} />
          <Stepper label="Draws"  value={draws}  onChange={setDraws}  disabled={!setupValid} />
        </div>

        <div className="mt-5 text-center text-sm">
          {!setupValid && (
            <span className="text-gray-400">Enter tournament details above</span>
          )}
          {setupValid && recordOverflow && (
            <span className="text-red-500">Record exceeds total rounds</span>
          )}
          {setupValid && !recordOverflow && roundsPlayed === 0 && (
            <span className="text-gray-400">Round 0 of {R} — update as you play</span>
          )}
          {setupValid && !recordOverflow && roundsPlayed > 0 && (
            <span className="text-gray-500">
              Round {roundsPlayed} of {R}
              {roundsRemaining > 0
                ? ` — ${roundsRemaining} round${roundsRemaining > 1 ? 's' : ''} remaining`
                : ' — Swiss complete'}
            </span>
          )}
        </div>
      </div>

      {/* Analysis */}
      {analysis && (() => {
        const styles = VERDICT_STYLES[analysis.color]
        return (
          <div className={`border rounded-lg p-6 ${styles.card}`}>
            <div className={`text-xl font-bold mb-1 ${styles.heading}`}>
              {analysis.status}
            </div>
            <p className="text-sm text-gray-600 mb-5">{analysis.detail}</p>

            <div className={`grid gap-4 ${analysis.roundsRemaining > 0 ? 'grid-cols-4' : 'grid-cols-2'}`}>
              <StatItem label="Current pts" value={analysis.currentPoints} />
              {analysis.roundsRemaining > 0 && (
                <>
                  <StatItem label="Draw out" value={analysis.pointsIfDrawOut} />
                  <StatItem label="Win out"  value={analysis.pointsIfWinOut} />
                </>
              )}
              <StatItem label="Est. cutline" value={analysis.range} muted />
            </div>

            <p className="text-xs text-gray-400 mt-5 leading-relaxed">
              The upper end assumes no draws in the field; the lower end is calibrated to
              {fieldDrawCount != null
                ? ` the ${fieldDrawCount} player${fieldDrawCount !== 1 ? 's' : ''} with draws you entered.`
                : ' a ~20% draw rate. Enter "players with draws" from standings to narrow this range.'}
            </p>
          </div>
        )
      })()}

      {!setupValid && (
        <p className="text-center text-sm text-gray-400 mt-2">
          Fill in the tournament setup to see your analysis.
        </p>
      )}
      </div>
    </div>
  )
}

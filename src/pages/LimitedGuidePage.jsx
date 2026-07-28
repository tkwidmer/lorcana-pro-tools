import { useState } from 'react'

const FORMATS = {
  draft: {
    label: 'Draft',
    deckSize: 35,
    packs: 4,
    description: '35-card deck · 4 packs · pick one card, pass to next player',
    curve: [
      { cost: '1 ink',  range: '1–3' },
      { cost: '2 ink',  range: '4–6' },
      { cost: '3 ink',  range: '9–11' },
      { cost: '4 ink',  range: '9–11' },
      { cost: '5 ink',  range: '5–7' },
      { cost: '6+ ink', range: '2–4' },
    ],
    uninkable: '4–6',
  },
  sealed: {
    label: 'Sealed',
    deckSize: 40,
    packs: 6,
    description: '40-card deck · 6 packs · build from your pool',
    curve: [
      { cost: '1 ink',  range: '1–3' },
      { cost: '2 ink',  range: '5–7' },
      { cost: '3 ink',  range: '10–13' },
      { cost: '4 ink',  range: '10–13' },
      { cost: '5 ink',  range: '6–8' },
      { cost: '6+ ink', range: '2–5' },
    ],
    uninkable: '5–8',
  },
}

const BREAD = [
  {
    letter: 'B',
    word: 'Bombs',
    description: 'High-impact cards that win the game on their own — powerful characters or effects that demand an immediate answer.',
  },
  {
    letter: 'R',
    word: 'Removal',
    description: 'Cards that deal with your opponent\'s threats: banish, return to hand, exert, or otherwise neutralize dangerous characters.',
  },
  {
    letter: 'E',
    word: 'Evasive',
    description: 'Characters with Evasive can only be challenged by other Evasive characters, making them reliable lore-racers.',
  },
  {
    letter: 'A',
    word: 'Approach',
    description: 'Your plan for winning — are you racing to 20 lore, controlling the board, or grinding with card advantage? Know your angle.',
  },
  {
    letter: 'D',
    word: 'Draw',
    description: 'Card draw and card advantage effects keep your hand full and ensure you don\'t run out of gas in longer games.',
  },
]

function FormatToggle({ value, onChange }) {
  return (
    <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden">
      {Object.entries(FORMATS).map(([key, fmt]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-5 py-2 text-sm font-medium transition-colors ${
            value === key
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {fmt.label}
        </button>
      ))}
    </div>
  )
}

function BreadSection() {
  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <div className="flex items-baseline gap-3 mb-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Drafting with BREAD
        </h2>
      </div>
      <div className="space-y-4">
        {BREAD.map(({ letter, word, description }) => (
          <div key={letter} className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded bg-gray-900 text-white flex items-center justify-center font-bold text-sm">
              {letter}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{word}</div>
              <div className="text-sm text-gray-500 leading-relaxed">{description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CurveSection({ format }) {
  const fmt = FORMATS[format]
  const peak = fmt.curve.reduce((max, row) => {
    const hi = parseInt(row.range.split('–')[1])
    return hi > max ? hi : max
  }, 0)

  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-5">
        Ideal Mana Curve
      </h2>
      <div className="space-y-3">
        {fmt.curve.map(({ cost, range }) => {
          const [lo, hi] = range.split('–').map(Number)
          const mid = (lo + hi) / 2
          const barPct = Math.round((mid / peak) * 100)
          return (
            <div key={cost} className="flex items-center gap-3">
              <div className="w-14 text-sm text-gray-500 text-right flex-shrink-0">{cost}</div>
              <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full bg-gray-900 rounded transition-all duration-300"
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className="w-12 text-sm font-medium text-gray-900 flex-shrink-0">{range}</div>
            </div>
          )
        })}
      </div>
      <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
        <span className="text-sm text-gray-500">Uninkable cards</span>
        <span className="text-sm font-semibold text-gray-900">{fmt.uninkable}</span>
      </div>
    </div>
  )
}

export function LimitedGuidePage() {
  const [format, setFormat] = useState('draft')
  const fmt = FORMATS[format]

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="max-w-lg">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
            Limited Guide
          </h1>
          <p className="text-gray-500 mb-5">
            Quick reference for building your best sealed or draft deck.
          </p>
          <FormatToggle value={format} onChange={setFormat} />
          <p className="text-sm text-gray-400 mt-2">{fmt.description}</p>
        </div>

        <div className="space-y-4">
          <BreadSection />
          <CurveSection format={format} />
        </div>
      </div>
    </div>
  )
}

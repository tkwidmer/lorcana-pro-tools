// Okabe-Ito colorblind-safe qualitative colors (blue/orange/magenta) — fixed
// per series index, never cycled, matching the color-per-entity rule chart
// series should follow.
const SERIES_COLORS = ['#0072B2', '#E69F00', '#CC79A7']

// Small multi-line sparkline showing each tracked archetype's play rate or
// win rate across the most recent weeks duels.ink has stats for. `series`:
// [{ key, name, values }] — one value per entry in `weeks`, oldest first.
// `weeks`: [{ startDate, label }].
//
// `scaleFromZero` picks the y-axis domain: play rate reads naturally
// against a 0 baseline (most archetypes cluster well below the max), but
// win rate clusters tightly around 50% — a 0 baseline would flatten a
// meaningful 47%→53% swing into a barely-visible line near the top of the
// chart, so win-rate charts should pass `scaleFromZero={false}` to get a
// tight, padded domain around the actual data instead.
export function MetaTrendChart({ weeks, series, metricLabel = 'play rate', formatValue = v => `${v.toFixed(1)}%`, scaleFromZero = true }) {
  if (weeks.length < 2 || series.length === 0) return null

  const W = 600
  const H = 150
  const PAD_TOP = 12
  const PAD_BOTTOM = 22
  const PAD_LEFT = 4
  const PAD_RIGHT = 130 // room for end-of-line labels
  const plotW = W - PAD_LEFT - PAD_RIGHT
  const plotH = H - PAD_TOP - PAD_BOTTOM

  const allValues = series.flatMap(s => s.values)
  const rawMax = Math.max(...allValues, scaleFromZero ? 1 : -Infinity)
  const rawMin = Math.min(...allValues)
  const domainMax = scaleFromZero ? rawMax : rawMax + (rawMax - rawMin || 1) * 0.15
  const domainMin = scaleFromZero ? 0 : rawMin - (rawMax - rawMin || 1) * 0.15
  const domainSpan = domainMax - domainMin || 1

  const xForIndex = i => PAD_LEFT + (weeks.length === 1 ? 0 : (i / (weeks.length - 1)) * plotW)
  const yForValue = v => PAD_TOP + plotH - ((v - domainMin) / domainSpan) * plotH

  // Stack end-of-line labels vertically when their natural positions would
  // otherwise overlap.
  const MIN_LABEL_GAP = 15
  const endPoints = series
    .map((s, i) => ({
      ...s,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      endY: yForValue(s.values[s.values.length - 1]),
    }))
    .sort((a, b) => a.endY - b.endY)
  for (let i = 1; i < endPoints.length; i++) {
    if (endPoints[i].endY - endPoints[i - 1].endY < MIN_LABEL_GAP) {
      endPoints[i].endY = endPoints[i - 1].endY + MIN_LABEL_GAP
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" role="img" aria-label={`Archetype ${metricLabel} trend over recent weeks`}>
      {series.map((s, i) => {
        const color = SERIES_COLORS[i % SERIES_COLORS.length]
        const points = s.values.map((v, vi) => [xForIndex(vi), yForValue(v)])
        const path = points.map(([x, y], vi) => `${vi === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
        return (
          <g key={s.key}>
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {points.map(([x, y], vi) => (
              <circle key={vi} cx={x} cy={y} r="3" fill={color}>
                <title>{`${s.name}: ${formatValue(s.values[vi])} ${metricLabel} (${weeks[vi].label})`}</title>
              </circle>
            ))}
          </g>
        )
      })}
      {endPoints.map(ep => (
        <text
          key={ep.key}
          x={xForIndex(weeks.length - 1) + 8}
          y={ep.endY}
          dominantBaseline="middle"
          fontSize="11"
          fontWeight="600"
          fill={ep.color}
        >
          {ep.name} · {formatValue(ep.values[ep.values.length - 1])}
        </text>
      ))}
      {weeks.map((w, i) => (
        <text
          key={w.startDate}
          x={xForIndex(i)}
          y={H - 6}
          textAnchor="middle"
          fontSize="9"
          fill="rgb(148 163 184)"
        >
          {w.label.split(' - ')[0]}
        </text>
      ))}
    </svg>
  )
}

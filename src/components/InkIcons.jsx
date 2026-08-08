import { resolveInkName } from '../lib/inkColors'

// Resolves a list of raw color strings/tokens into valid ink names,
// preserving input order and de-duplicating (unlike resolveColors(), which
// sorts alphabetically — callers here rely on their own ordering).
function resolveOrdered(colors) {
  const seen = new Set()
  const result = []
  for (const c of colors ?? []) {
    for (const part of String(c ?? '').split(/[/-]/)) {
      const name = resolveInkName(part.trim())
      if (name && !seen.has(name)) {
        seen.add(name)
        result.push(name)
      }
    }
  }
  return result
}

// Single ink icon. `size` accepts either a pixel number or a Tailwind size
// class string (e.g. "w-4 h-4") to match the different call-site conventions
// this consolidates.
export function InkIcon({ color, size = 20, className = '', label }) {
  if (!color) return null
  const name = color.toLowerCase()
  const isPixelSize = typeof size === 'number'
  const text = label ?? name
  return (
    <img
      src={`/ink/${name}.png`}
      alt={text}
      title={text}
      className={`inline-block flex-shrink-0 ${isPixelSize ? '' : size} ${className}`.trim()}
      style={isPixelSize ? { width: size, height: size } : undefined}
    />
  )
}

// Renders one icon per ink in `colors`. Accepts an array of ink names, a
// "/"-or-"-"-delimited string (e.g. "Amber-Steel"), and either raw or
// display names ("red" resolves to "ruby") via resolveColors().
export function InkIcons({ colors, size = 20, className = '', emptyFallback = null, sort = false }) {
  const list = Array.isArray(colors) ? colors : [colors]
  const names = resolveOrdered(list)
  if (sort) names.sort()
  if (!names.length) return emptyFallback
  return (
    <span className={`inline-flex items-center gap-1 ${className}`.trim()}>
      {names.map((name) => (
        <InkIcon key={name} color={name} size={size} />
      ))}
    </span>
  )
}

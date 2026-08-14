const INK_NAME_MAP = {
  red: 'ruby', ruby: 'ruby',
  blue: 'sapphire', sapphire: 'sapphire',
  green: 'emerald', emerald: 'emerald',
  yellow: 'amber', amber: 'amber',
  purple: 'amethyst', amethyst: 'amethyst',
  gray: 'steel', grey: 'steel', steel: 'steel',
}

export const VALID_INKS = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel']

// Hex values picked directly from /public/ink/{color}.png (the official ink icons).
export const INK_HEX = {
  amber: '#f4b223',
  amethyst: '#7c4182',
  emerald: '#329044',
  ruby: '#d50037',
  sapphire: '#0093c9',
  steel: '#97a3ae',
}

// Text readable against a given ink's background fill.
export const INK_TEXT_ON = {
  amber: '#3a2a00',
  amethyst: '#ffffff',
  emerald: '#ffffff',
  ruby: '#ffffff',
  sapphire: '#ffffff',
  steel: '#1a2228',
}

export function resolveInkName(color) {
  if (!color) return null
  return INK_NAME_MAP[color.toLowerCase()] ?? null
}

export function resolveColors(colors) {
  const result = new Set()
  for (const c of (colors ?? [])) {
    // LorcanaJSON's `color` field uses "/" for some multi-ink representations
    // and "-" for dual-ink cards (e.g. "Amber-Steel"); split on either.
    for (const part of String(c).split(/[/-]/)) {
      const name = resolveInkName(part.trim())
      if (name) result.add(name)
    }
  }
  return Array.from(result).sort()
}

export function matchupKey(colors) {
  return resolveColors(colors).join('+') || 'unknown'
}

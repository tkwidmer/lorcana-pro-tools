const INK_NAME_MAP = {
  red: 'ruby', ruby: 'ruby',
  blue: 'sapphire', sapphire: 'sapphire',
  green: 'emerald', emerald: 'emerald',
  yellow: 'amber', amber: 'amber',
  purple: 'amethyst', amethyst: 'amethyst',
  gray: 'steel', grey: 'steel', steel: 'steel',
}

export const VALID_INKS = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel']

export function resolveInkName(color) {
  if (!color) return null
  return INK_NAME_MAP[color.toLowerCase()] ?? null
}

export function resolveColors(colors) {
  const result = new Set()
  for (const c of (colors ?? [])) {
    for (const part of String(c).split('/')) {
      const name = resolveInkName(part.trim())
      if (name) result.add(name)
    }
  }
  return Array.from(result).sort()
}

export function matchupKey(colors) {
  return resolveColors(colors).join('+') || 'unknown'
}

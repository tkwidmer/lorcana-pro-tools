// Format legality of one LorcanaJSON printing. `allowedInFormats` is already
// propagated by card name upstream (a set-1 printing of a card reprinted in
// set 9 reads Core-legal), so a printing's status is its name's status.
// Status: legal | banned (since) | rotated (until) | not_legal.
export const FORMATS = [
  { key: 'Core', label: 'Core' },
  { key: 'Infinity', label: 'Infinity' },
  { key: 'FormatCoconut', label: 'Coconut' },
]

function statusOf(entry) {
  if (!entry) return { status: 'not_legal' }
  if (entry.allowed) return { status: 'legal' }
  if (entry.bannedSinceDate) return { status: 'banned', since: entry.bannedSinceDate }
  if (entry.allowedUntilDate) return { status: 'rotated', until: entry.allowedUntilDate }
  return { status: 'not_legal' }
}

export function formatStatus(card, format) {
  const formats = card.allowedInFormats ?? {}
  switch (format) {
    case 'Core':
    case 'Infinity':
      return statusOf(formats[format])
    case 'FormatCoconut': {
      // Coconut has no pool of its own in the data: it plays the Infinity
      // pool, and FormatCoconut only ever carries a ban.
      const ban = formats.FormatCoconut?.bannedSinceDate
      return ban ? { status: 'banned', since: ban } : statusOf(formats.Infinity)
    }
    default:
      throw new Error(`Unknown format: ${format}`)
  }
}

export function legality(card) {
  return Object.fromEntries(FORMATS.map(f => [f.key, formatStatus(card, f.key)]))
}

import { resolveColors } from '../lib/inkColors'
import { inkFill, textColorFor } from '../lib/decklistShared'

// The game's own inkwell cost emblem: the hexagon wrapped in the
// aperture-blade ring for inkable cards, or the bare hexagon for uninkable
// ones. A small dark disc sits behind the number for legibility against the
// gold artwork regardless of the card's ink color.
export function CostBadge({ cost, inkable }) {
  const src = inkable ? '/ink-cost/inkable.png' : '/ink-cost/uninkable.png'
  return (
    <span className="relative flex-shrink-0 w-6 h-6 flex items-center justify-center">
      <img src={src} alt="" className="absolute inset-0 w-full h-full object-contain" />
      {/* Literal white-on-black, independent of the dark-mode `white` token remap
          (which repurposes `text-white`/`bg-white` as a dark surface color) — this
          badge always needs true white text on a true black disc. */}
      <span
        className="relative w-3.5 h-3.5 rounded-full flex items-center justify-center leading-none font-bold text-[9px]"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#ffffff' }}
      >
        {cost}
      </span>
    </span>
  )
}

export function CardBar({ entry, selected, onToggle }) {
  const { card, name, count } = entry
  const colors = resolveColors(card.colors?.length ? card.colors : [card.color])
  const textColor = textColorFor(colors)
  const isCharacterOrLocation = card.type === 'Character' || card.type === 'Location'

  let stats = null
  if (card.type === 'Character') {
    stats = `${card.strength ?? '–'}/${card.willpower ?? '–'}${card.lore ? ` · ${'◆'.repeat(card.lore)}` : ''}`
  } else if (card.type === 'Location') {
    stats = `W:${card.willpower ?? '–'}${card.lore ? ` · ${'◆'.repeat(card.lore)}` : ''}`
  }

  const content = (
    <>
      <CostBadge cost={card.cost} inkable={card.inkwell} />
      <span className="flex-1 min-w-0 text-xs font-semibold truncate">
        {name}
        {isCharacterOrLocation && stats && (
          <span className="font-normal opacity-80"> · {stats}</span>
        )}
      </span>
      <span className="flex-shrink-0 text-xs font-bold tabular-nums">×{count}</span>
    </>
  )

  const className = `w-full text-left rounded-md px-2 py-1 flex items-center gap-2 transition-shadow ${
    selected ? 'ring-2 ring-offset-1 ring-gray-900' : onToggle ? 'hover:opacity-90' : ''
  }`

  // The overlay view has no selection interaction — render a plain div so it
  // isn't a focusable/clickable button in an OBS Browser Source.
  if (!onToggle) {
    return (
      <div style={{ ...inkFill(colors), color: textColor }} className={className}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onToggle(entry)}
      style={{ ...inkFill(colors), color: textColor }}
      className={className}
    >
      {content}
    </button>
  )
}

import { Badge } from './ui/Badge'

// In-progress and upcoming majors from the Play Hub (`live-majors`, the
// admin import's discovery sweep filtered to what is on now or within two
// weeks). Shared by the team page and Tournament Lookup's landing; each
// decides what the row's right-hand side does via `renderAction(event)`.
// Hidden entirely when the sweep fails or finds nothing: it is a shortcut,
// not a page's content.

function startsIn(startDatetime) {
  const days = Math.ceil((new Date(startDatetime) - Date.now()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 7) return `In ${days} days`
  return new Date(startDatetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function LiveStatus({ event }) {
  if (event.displayStatus === 'inProgress') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        Live
      </span>
    )
  }
  return <span className="text-xs font-semibold text-amber-700">{startsIn(event.startDatetime)}</span>
}

export function LiveMajorsList({ events, renderAction, renderMeta }) {
  if (!events || events.length === 0) return null
  return (
    <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
      {events.map((e) => (
        <div key={e.eventId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
          <span className="w-16 shrink-0"><LiveStatus event={e} /></span>
          <Badge tone="neutral">{e.label}</Badge>
          <span className="font-medium text-gray-900">{e.name}</span>
          <span className="text-xs text-gray-500">
            {e.storeName ? `${e.storeName} · ` : ''}
            {e.playerCount} {e.displayStatus === 'inProgress' ? 'players' : 'registered'}
          </span>
          {renderMeta && <span className="ml-auto text-gray-600">{renderMeta(e)}</span>}
          {renderAction && <span className={renderMeta ? '' : 'ml-auto'}>{renderAction(e)}</span>}
        </div>
      ))}
    </div>
  )
}

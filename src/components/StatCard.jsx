// Small label/value stat card. `size` picks between the compact and large
// variants previously duplicated as Metric/Stat/StatItem across pages.
export function StatCard({ label, value, hint, size = 'md', muted = false, centered = false }) {
  if (size === 'centered' || centered) {
    return (
      <div className="text-center">
        <div className={`text-xl font-bold ${muted ? 'text-gray-400' : 'text-gray-900'}`}>{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      </div>
    )
  }

  const valueClass = size === 'lg' ? 'text-2xl' : 'text-lg'
  const padding = size === 'lg' ? 'p-3 rounded-lg' : 'p-2 rounded'

  return (
    <div className={`bg-gray-50 ${padding}`}>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`${valueClass} font-bold text-gray-900`}>{value}</div>
      {hint && <div className="text-xs text-gray-400">{hint}</div>}
    </div>
  )
}

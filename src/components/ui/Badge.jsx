// Small status label. `forge` marks supporter-only tools and supporter
// status; `neutral` is for everything else (Admin, Draft).
const TONES = {
  forge: 'bg-forge-soft text-forge-ink',
  neutral: 'bg-gray-100 text-gray-600',
}

export function Badge({ tone = 'forge', className = '', children }) {
  if (!TONES[tone]) throw new Error(`Unknown Badge tone: ${tone}`)
  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

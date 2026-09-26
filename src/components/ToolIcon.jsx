import { TOOL_ICONS } from '../lib/toolIcons'

// A catalog tool's glyph (see lib/toolIcons.js), drawn in currentColor.
export function ToolIcon({ name, className = 'h-5 w-5' }) {
  const paths = TOOL_ICONS[name]
  if (!paths) throw new Error(`Unknown tool icon: ${name}`)
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths.map(d => <path key={d} d={d} />)}
    </svg>
  )
}

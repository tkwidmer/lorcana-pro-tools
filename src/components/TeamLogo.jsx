import { teamInitials } from '../lib/teams'

// A team's logo, or an initials mark when it has none (never a broken
// image). `size` is the Tailwind box class; `muted` for disbanded teams.
export function TeamLogo({ name, logoUrl, size = 'h-8 w-8', muted = false, className = '' }) {
  const box = `${size} shrink-0 grid place-items-center rounded overflow-hidden ${className}`
  if (logoUrl) return <img src={logoUrl} alt="" className={`${box} object-contain bg-white border border-gray-200`} />
  return (
    <span
      className={`${box} font-display text-xs tracking-wide ${muted ? 'bg-gray-200 text-gray-500' : 'bg-gray-900 text-white'}`}
      aria-hidden="true"
    >
      {teamInitials(name)}
    </span>
  )
}

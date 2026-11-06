// The favorite toggle and the team-member mark, used by TournamentLookupPage
// (Standings/Matches/Roster/Favorites/Team tabs) and EliminationBracket —
// pulled out to a standalone file so both can import it without a
// page <-> component circular import. Favorites are the caster's own
// (localStorage); team membership comes from the Team Tracker directory
// (the team picked on the Team tab), so the badge is display-only.

export function FavoriteStar({ active, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={active ? 'Unfavorite' : 'Favorite'}
      className={`text-lg leading-none transition-colors ${active ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-gray-400'} ${className}`}
    >
      {active ? '★' : '☆'}
    </button>
  )
}

export function TeamBadge({ className = '' }) {
  return (
    <span
      title="Team member"
      className={`w-5 h-5 rounded-sm text-[10px] font-bold leading-none flex items-center justify-center bg-gray-900 text-white ${className}`}
    >
      T
    </span>
  )
}

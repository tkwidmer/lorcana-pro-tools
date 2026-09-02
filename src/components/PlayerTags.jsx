// Shared favorite/team-tag toggle buttons, used by TournamentLookupPage
// (Standings/Matches/Roster/Favorites/Team tabs) and EliminationBracket —
// pulled out to a standalone file so both can import it without a
// page <-> component circular import.

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

export function TeamBadge({ active, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={active ? 'Remove from my team' : 'Add to my team'}
      className={`w-5 h-5 rounded-full text-[10px] font-bold leading-none flex items-center justify-center transition-colors ${
        active ? 'bg-purple-500 text-white hover:bg-purple-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-300'
      } ${className}`}
    >
      T
    </button>
  )
}

// Underlined tab bar. Wrap `Tab`s in `Tabs`; the active tab gets the forge
// underline. Scrolls sideways on narrow screens instead of wrapping.
export function Tabs({ className = '', children }) {
  return (
    <div role="tablist" className={`flex gap-1 border-b border-gray-200 overflow-x-auto ${className}`}>
      {children}
    </div>
  )
}

export function Tab({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 -mb-px border-b-[3px] font-display text-sm uppercase tracking-wider whitespace-nowrap transition-colors ${
        active ? 'border-forge text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  )
}

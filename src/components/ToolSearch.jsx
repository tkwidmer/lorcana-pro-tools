import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SECTIONS } from '../lib/siteSections'
import { ToolIcon } from './ToolIcon'

const TOOLS = SECTIONS.flatMap(section =>
  section.tools.filter(tool => tool.path).map(tool => ({ ...tool, section: section.navLabel }))
)

// Every query word must appear in the tool's name, section, or description;
// tools whose name matches come first.
function searchTools(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return TOOLS
  const matches = TOOLS.filter(tool => {
    const text = `${tool.name} ${tool.section} ${tool.description}`.toLowerCase()
    return words.every(word => text.includes(word))
  })
  const nameHit = tool => words.every(word => tool.name.toLowerCase().includes(word))
  return [...matches.filter(nameHit), ...matches.filter(tool => !nameHit(tool))]
}

// ⌘K / Ctrl+K quick switcher over the tool catalog. Mounted only while open,
// so the query and selection start fresh each time.
export function ToolSearch({ onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const results = searchTools(query)

  const go = tool => {
    onClose()
    navigate(tool.path)
  }

  const handleKeyDown = e => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[active]) go(results[active])
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search tools"
        className="w-full max-w-lg bg-white border border-gray-200 rounded-lg shadow-2xl overflow-hidden"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-gray-200">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="text-gray-400 shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search tools…"
            aria-label="Search tools"
            aria-controls="tool-search-results"
            className="flex-1 bg-transparent py-3.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <kbd className="text-[10px] font-mono text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul id="tool-search-results" role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-500">No tools match “{query}”.</li>
          )}
          {results.map((tool, i) => (
            <li
              key={tool.path}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(tool)}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm ${i === active ? 'bg-forge-soft' : ''}`}
            >
              <ToolIcon name={tool.icon} className="h-4 w-4 text-gray-500 shrink-0" />
              <span className="font-medium text-gray-900">{tool.name}</span>
              <span className="ml-auto text-xs text-gray-500">{tool.section}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

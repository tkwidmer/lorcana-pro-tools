import { Link } from 'react-router-dom'
import { Card } from './ui/Card'

// Small pieces shared by the three public results pages (/results/*).

// Provenance line under every results page.
export function ArchiveFootnote() {
  return (
    <p className="text-xs text-gray-400 mt-8">
      Results as published on Ravensburger Play Hub. Players appear under the name they registered with.
    </p>
  )
}

export function ArchiveLoading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <span className="inline-block w-3 h-3 border-2 border-forge border-t-transparent rounded-full animate-spin" />
      {label}
    </div>
  )
}

// A failed or unknown-id load: a card with a way back, never the error boundary.
export function ArchiveError({ error, notFoundLabel, failedLabel }) {
  return (
    <div className="w-full px-6 py-8">
      <Card className="p-6 max-w-md">
        <p className="text-gray-900 font-medium mb-2">{error.status === 404 ? notFoundLabel : failedLabel}</p>
        <Link to="/results" className="text-sm text-forge-ink hover:underline">← All results</Link>
      </Card>
    </div>
  )
}

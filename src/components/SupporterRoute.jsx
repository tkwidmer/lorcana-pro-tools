import { Link, useLocation } from 'react-router-dom'
import { useSupporter } from '../hooks/useSupporter'
import { METAFY_JOIN_URL, METAFY_PRICE } from '../lib/access'
import { findTool } from '../lib/siteSections'
import { Badge } from './ui/Badge'
import { MetafyAccessSteps } from './MetafyAccessSteps'
import { Button } from './ui/Button'

// What a locked tool looks like to a visitor or a non-supporter: the tool's
// catalog name and description, a screenshot of it in use
// (public/previews/<tool path>.jpg — a unit test checks one exists for every
// SUPPORTER_PATHS entry) and the Metafy call to action.
function Gate({ signedIn, pathname }) {
  const match = findTool(pathname)
  const tool = match?.tool

  return (
    <div className="w-full px-6 py-8">
      <header className="mb-6">
        {match && (
          <p className="text-xs font-semibold uppercase tracking-widest text-forge-ink mb-1">
            {match.section.title}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl sm:text-4xl font-medium leading-tight text-gray-900">
            {tool?.name ?? 'Supporters only'}
          </h1>
          <Badge>Supporters</Badge>
        </div>
        {tool && <p className="text-gray-500 mt-1 max-w-3xl">{tool.description}</p>}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 items-start">
        {tool && (
          <img
            src={`/previews${tool.path}.jpg`}
            alt={`${tool.name} in use`}
            className="w-full h-auto rounded-lg border border-gray-200"
          />
        )}

        <div className="bg-white border border-gray-200 border-b-[3px] rounded-lg p-6 flex flex-col gap-4">
          <span className="h-10 w-10 grid place-items-center rounded bg-ink">
            <img src="/metafy-icon.svg" alt="" className="h-5 w-auto" />
          </span>
          <h2 className="font-display text-xl font-medium uppercase tracking-wide text-gray-900">
            Unlock {tool?.name ?? 'this tool'}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Every supporter tool opens up — deck insights, match history and analytics, coaching
            tools, tournament tools and the stream overlay. How to get in:
          </p>
          <MetafyAccessSteps signedIn={signedIn} />
          <p className="text-gray-900">
            <span className="font-display text-4xl font-medium">{METAFY_PRICE}</span>
            <span className="text-sm text-gray-500"> / month</span>
          </p>
          <Button variant="primary" href={METAFY_JOIN_URL} target="_blank" rel="noopener noreferrer">
            Become a supporter on Metafy
          </Button>
          {signedIn ? (
            <Link to="/settings" className="text-sm text-gray-500 hover:text-gray-900 hover:underline">
              Already subscribed? Connect your Metafy account in Settings →
            </Link>
          ) : (
            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-900 hover:underline">
              Already subscribed and connected? Sign in →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// `previewPath` names the catalog tool to present when the gated route isn't
// itself a catalog entry (a Scouting Library sub-page shows the Library's).
export function SupporterRoute({ children, previewPath }) {
  const { isSupporter, user, isLoading } = useSupporter()
  const { pathname } = useLocation()

  if (isLoading) {
    return (
      <div className="w-full px-6 py-24 text-center text-sm text-gray-400">
        Loading…
      </div>
    )
  }

  if (!isSupporter) return <Gate signedIn={!!user} pathname={previewPath ?? pathname} />

  return children
}

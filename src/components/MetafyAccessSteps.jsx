import { Link } from 'react-router-dom'
import { METAFY_JOIN_URL, METAFY_PRICE } from '../lib/access'

const LINK = 'text-gray-900 underline hover:text-forge-ink'

// How supporter access is granted, as the steps a backer takes. Shown on the
// supporter gate and on the Settings page's Metafy card so the "link your
// account" step is never a surprise: a Metafy subscription alone does
// nothing until the account is connected here.
export function MetafyAccessSteps({ signedIn, onSettings = false }) {
  return (
    <ol className="list-decimal pl-5 text-sm text-gray-600 leading-relaxed flex flex-col gap-1.5">
      <li>
        Subscribe to <strong className="text-gray-900">The Forge</strong> tier ({METAFY_PRICE}/month) on{' '}
        <a href={METAFY_JOIN_URL} target="_blank" rel="noopener noreferrer" className={LINK}>Metafy</a>.
        The cheaper Supporter tier doesn't unlock the app.
      </li>
      {!signedIn && (
        <li>
          <Link to="/login" className={LINK}>Sign in</Link> here with Google.
        </li>
      )}
      <li>
        {onSettings
          ? 'Click Connect Metafy below'
          : <>Open <Link to="/settings" className={LINK}>Settings</Link> and click Connect Metafy</>}
        , then approve the request on Metafy. Your access unlocks as soon as you're sent back.
      </li>
    </ol>
  )
}

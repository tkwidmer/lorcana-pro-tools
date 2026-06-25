import { Link } from 'react-router-dom'
import { useSupporter } from '../hooks/useSupporter'

function Gate({ signedIn }) {
  return (
    <div className="max-w-xl mx-auto px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-3">
        Supporters only
      </h1>
      <p className="text-gray-500 mb-8 leading-relaxed">
        This tool is available to Lorcana Pro Tools supporters.
        {signedIn
          ? ' Your account doesn’t have supporter access yet.'
          : ' Sign in with a supporter account to continue.'}
      </p>
      {signedIn ? (
        <Link
          to="/"
          className="inline-block border border-gray-900 text-sm font-medium px-5 py-2 rounded hover:bg-gray-900 hover:text-white transition-colors"
        >
          Back to tools
        </Link>
      ) : (
        <Link
          to="/login"
          className="inline-block border border-gray-900 text-sm font-medium px-5 py-2 rounded hover:bg-gray-900 hover:text-white transition-colors"
        >
          Sign in
        </Link>
      )}
    </div>
  )
}

export function SupporterRoute({ children }) {
  const { isSupporter, user, isLoading } = useSupporter()

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-24 text-center text-sm text-gray-400">
        Loading…
      </div>
    )
  }

  if (!isSupporter) return <Gate signedIn={!!user} />

  return children
}

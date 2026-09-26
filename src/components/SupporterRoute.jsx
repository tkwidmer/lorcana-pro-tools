import { useSupporter } from '../hooks/useSupporter'
import { Button } from './ui/Button'

function Gate({ signedIn }) {
  return (
    <div className="max-w-xl mx-auto px-6 py-24 text-center">
      <h1 className="text-3xl font-medium text-gray-900 mb-3">
        Supporters only
      </h1>
      <p className="text-gray-500 mb-8 leading-relaxed">
        This tool is available to InkbornForge supporters.
        {signedIn
          ? ' Your account doesn’t have supporter access yet.'
          : ' Sign in with a supporter account to continue.'}
      </p>
      {signedIn ? (
        <Button to="/">Back to tools</Button>
      ) : (
        <Button to="/login" variant="primary">Sign in</Button>
      )}
    </div>
  )
}

export function SupporterRoute({ children }) {
  const { isSupporter, user, isLoading } = useSupporter()

  if (isLoading) {
    return (
      <div className="w-full px-6 py-24 text-center text-sm text-gray-400">
        Loading…
      </div>
    )
  }

  if (!isSupporter) return <Gate signedIn={!!user} />

  return children
}

import { Component } from 'react'
import { Link } from 'react-router-dom'

function Fallback({ error, onReset }) {
  return (
    <div className="max-w-xl mx-auto px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-3">
        Something broke
      </h1>
      <p className="text-gray-500 mb-8 leading-relaxed">
        This tool hit an unexpected error and couldn’t finish rendering. Your
        saved data is untouched — try again, reload the page, or head back to
        the tool list.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onReset}
          className="border border-gray-900 text-sm font-medium px-5 py-2 rounded hover:bg-gray-900 hover:text-white transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="border border-gray-300 text-sm font-medium px-5 py-2 rounded text-gray-600 hover:border-gray-500 transition-colors"
        >
          Reload page
        </button>
        <Link
          to="/"
          className="text-sm font-medium px-5 py-2 text-gray-500 hover:text-gray-900 transition-colors"
        >
          Back to tools
        </Link>
      </div>

      {import.meta.env.DEV && error && (
        <pre className="mt-8 text-left text-xs bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto max-h-72 font-mono text-red-700 whitespace-pre-wrap">
          {error.stack || String(error)}
        </pre>
      )}
    </div>
  )
}

export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    // Clear the error when the reset key changes (e.g. route navigation) so a
    // broken page doesn't stick around after the user navigates elsewhere.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught an error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <Fallback
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

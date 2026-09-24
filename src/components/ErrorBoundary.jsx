import { Component } from 'react'
import { Button } from './ui/Button'

function Fallback({ error, onReset }) {
  return (
    <div className="max-w-xl mx-auto px-6 py-24 text-center">
      <h1 className="text-3xl font-medium text-gray-900 mb-3">
        Something broke
      </h1>
      <p className="text-gray-500 mb-8 leading-relaxed">
        This tool hit an unexpected error and couldn’t finish rendering. Your
        saved data is untouched — try again, reload the page, or head back to
        the tool list.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Button variant="primary" onClick={onReset}>Try again</Button>
        <Button variant="quiet" onClick={() => window.location.reload()}>Reload page</Button>
        <Button variant="quiet" to="/">Back to tools</Button>
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

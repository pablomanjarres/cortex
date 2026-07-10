import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Human-readable route name shown in the crash panel. */
  name: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Per-route error boundary: a render crash in one page shows a compact panel
 * (route name + error message + Reload) instead of blanking the whole app.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Cortex] route "${this.props.name}" crashed:`, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[50vh] items-center justify-center p-6">
          <div className="w-full max-w-md rounded-lg border border-red-500/30 bg-red-500/5 p-5">
            <div className="text-sm font-semibold text-red-400">
              The {this.props.name} page crashed
            </div>
            <div className="mt-2 max-h-32 overflow-y-auto break-words font-mono text-xs text-neutral-400">
              {this.state.error.message || String(this.state.error)}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

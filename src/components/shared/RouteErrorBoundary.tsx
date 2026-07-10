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
          <div className="w-full max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-card">
            <div className="text-sm font-semibold text-destructive">
              The {this.props.name} page crashed
            </div>
            <div className="mt-2 max-h-32 overflow-y-auto break-words font-mono text-xs text-muted-foreground">
              {this.state.error.message || String(this.state.error)}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary"
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

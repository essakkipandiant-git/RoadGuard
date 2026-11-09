import React, { Component, ErrorInfo, ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("RoadGuard ErrorBoundary caught an unhandled error:", error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-slate-100">
          <div className="max-w-md w-full p-8 rounded-2xl border border-rose-500/30 bg-slate-900/90 shadow-2xl backdrop-blur-xl text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertTriangle size={28} />
            </div>
            <h2 className="text-xl font-bold tracking-tight mb-2 text-white">
              {this.props.fallbackTitle || "Something went wrong"}
            </h2>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              An unexpected interface error occurred. You can reload the page or reset the view to continue.
            </p>
            {this.state.error && (
              <div className="mb-6 p-3 rounded-lg bg-black/40 border border-slate-800 text-left font-mono text-xs text-rose-300 overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-2 transition-colors shadow-lg shadow-rose-950/50"
              >
                <RefreshCw size={14} />
                <span>Reload Page</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}


import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | undefined
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { error: undefined }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Tree encountered an unexpected error.', error, info.componentStack)
  }

  public render(): ReactNode {
    if (this.state.error === undefined) return this.props.children
    return (
      <main className="app-shell error-state" role="alert">
        <h1>Tree encountered an unexpected error</h1>
        <p>{this.state.error.message}</p>
        <p>Reload to continue from your last saved document.</p>
        <button className="error-reload" onClick={() => globalThis.location.reload()} type="button">
          Reload
        </button>
      </main>
    )
  }
}

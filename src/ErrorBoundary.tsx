import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AnimeBoxD error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] p-6 text-center text-[var(--text)]">
          <span className="text-5xl">😵</span>
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="max-w-sm text-sm text-[var(--muted)]">
            A page section crashed unexpectedly. This is usually a temporary glitch.
          </p>
          <button
            className="mt-2 rounded-xl bg-[var(--cyan)] px-5 py-2 text-sm font-semibold text-slate-950 hover:opacity-90"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
          <button
            className="text-xs text-[var(--muted)] underline underline-offset-2"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

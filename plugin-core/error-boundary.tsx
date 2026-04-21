import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  slot?: string;
  label?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export interface BoundaryErrorReport {
  error: Error;
  componentStack: string | null;
  slot: string | null;
  label: string | null;
}

// Registered by the `crashes` plugin at mount time. Module-level callback
// avoids a hard import from plugin-core into a plugin; the reporter is
// optional and best-effort.
let reporter: ((r: BoundaryErrorReport) => void) | null = null;

export function registerBoundaryReporter(
  fn: ((r: BoundaryErrorReport) => void) | null,
): void {
  reporter = fn;
}

export class PluginErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      reporter?.({
        error,
        componentStack: info.componentStack ?? null,
        slot: this.props.slot ?? null,
        label: this.props.label ?? null,
      });
    } catch {
      // Never throw from the error path.
    }
  }

  render() {
    if (this.state.error) {
      const tag = [this.props.slot, this.props.label]
        .filter(Boolean)
        .join(" / ");
      return (
        <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="font-medium">{tag || "Plugin"} crashed</span>
          <span className="truncate text-destructive/70">
            {this.state.error.message}
          </span>
          <button
            className="ml-auto shrink-0 underline hover:no-underline"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

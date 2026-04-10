import { Component, type ReactNode } from "react";

interface Props {
  slot?: string;
  label?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class PluginErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
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

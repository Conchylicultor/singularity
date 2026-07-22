import { Component, type ErrorInfo, type ReactNode } from "react";
import { CrashFallback } from "./crash-fallback";

interface Props {
  slot?: string;
  label?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class PluginErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(_error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private retry = () => {
    this.setState({ error: null, componentStack: null });
  };

  render() {
    if (this.state.error) {
      return (
        <CrashFallback
          report={{
            error: this.state.error,
            componentStack: this.state.componentStack,
            slot: this.props.slot ?? null,
            label: this.props.label ?? null,
          }}
          retry={this.retry}
        />
      );
    }
    return this.props.children;
  }
}

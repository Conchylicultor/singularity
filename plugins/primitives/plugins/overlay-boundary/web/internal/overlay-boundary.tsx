import { Component, type ErrorInfo, type ReactNode } from "react";

export interface OverlayFallbackProps {
  error: Error;
  componentStack: string | null;
  retry: () => void;
  kind: string;
}
type OverlayFallbackRenderer = (props: OverlayFallbackProps) => ReactNode;

// Single global renderer, injected by error-boundary at boot. This is the seam
// that breaks the ui-kit → error-boundary cycle: ui-kit owns the boundary +
// registry (low in the DAG); error-boundary fills the fallback from above.
let renderOverlayFallback: OverlayFallbackRenderer | null = null;
export function registerOverlayFallback(fn: OverlayFallbackRenderer): void {
  renderOverlayFallback = fn;
}

interface Props {
  kind: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
  componentStack: string | null;
}

export class OverlayBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(_e: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private retry = () => this.setState({ error: null, componentStack: null });

  render() {
    if (this.state.error) {
      if (renderOverlayFallback) {
        return renderOverlayFallback({
          error: this.state.error,
          componentStack: this.state.componentStack,
          retry: this.retry,
          kind: this.props.kind,
        });
      }
      // Minimal text-only fallback for the pre-registration edge only
      // (error-boundary registers the real CrashFallback at boot). Text-only ⇒
      // no `no-adhoc-layout` exemption needed.
      return (
        <button type="button" onClick={this.retry} title={this.state.error.message}>
          content failed · Retry
        </button>
      );
    }
    return this.props.children; // healthy: no DOM node, transparent (like SingleLineProvider)
  }
}

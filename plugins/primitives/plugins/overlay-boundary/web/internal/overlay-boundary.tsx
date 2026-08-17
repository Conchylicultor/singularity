import { Component, type ErrorInfo, type ReactNode } from "react";
import { defineInstallSink } from "@plugins/primitives/plugins/install-sink/web";

export interface OverlayFallbackProps {
  error: Error;
  componentStack: string | null;
  retry: () => void;
}
type OverlayFallbackRenderer = (props: OverlayFallbackProps) => ReactNode;

// Single global renderer, injected by error-boundary at boot. This is the seam
// that breaks the ui-kit → error-boundary cycle: ui-kit owns the boundary +
// registry (low in the DAG); error-boundary fills the fallback from above.
const overlayFallbackSink = defineInstallSink<OverlayFallbackRenderer>({
  name: "overlay-boundary.fallback",
  what: "the rich overlay crash fallback (installed by primitives/error-boundary at plugin boot)",
});

/**
 * Install the rich fallback. The disposer is dropped on purpose: this is a
 * boot-time registration for the life of the page, not a scoped installation,
 * and its one caller (`error-boundary`'s plugin definition) never unmounts.
 */
export function registerOverlayFallback(fn: OverlayFallbackRenderer): void {
  overlayFallbackSink.install(fn);
}

interface Props {
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
      // A sample rather than a subscription, and safe here where it would not
      // be in a function component: a class `render()` re-reads on every
      // commit, so if the fallback is installed after this boundary first
      // painted, the next render picks it up — nothing is cached. The
      // pre-registration edge below is therefore momentary, not permanent.
      const renderFallback = overlayFallbackSink.peek();
      if (renderFallback) {
        return renderFallback({
          error: this.state.error,
          componentStack: this.state.componentStack,
          retry: this.retry,
        });
      }
      // Minimal text-only fallback for the pre-registration edge only
      // (error-boundary registers the real CrashFallback at boot). Text-only ⇒
      // no `no-adhoc-layout` exemption needed.
      return (
        <button
          type="button"
          onClick={this.retry}
          title={this.state.error.message}
        >
          content failed · Retry
        </button>
      );
    }
    return this.props.children; // healthy: no DOM node, transparent (like SingleLineProvider)
  }
}

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { UNSAFE_unsealSlotComponent } from "@plugins/framework/plugins/web-sdk/core";
import { Text } from "@plugins/primitives/plugins/text/web";
import { ErrorBoundary } from "../slots";
import { callReporter, type BoundaryErrorReport } from "../reporter";

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

function CrashFallback({
  report,
  retry,
}: {
  report: BoundaryErrorReport;
  retry: () => void;
}) {
  const actions = ErrorBoundary.Action.useContributions();
  const [context, setContext] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    // Defer one tick so plugin-side effects (e.g. registerBoundaryReporter)
    // have run if this boundary fired during the very first commit.
    const timer = setTimeout(() => {
      const result = callReporter(report);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        // eslint-disable-next-line promise-safety/no-bare-catch
        (result as Promise<unknown>)
          .then((r) => {
            if (!cancelled) setContext(r ?? null);
          })
          .catch((err) => {
            // Never throw from the error path — log and swallow.
            console.error("[error-boundary] boundary reporter failed", err);
          });
      } else if (result !== undefined) {
        setContext(result);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [report]);

  const tag = [report.slot, report.label].filter(Boolean).join(" / ");
  return (
    <Text
      as="div"
      variant="caption"
      className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive"
    >
      <span className="font-medium">{tag || "Plugin"} crashed</span>
      <span className="truncate text-destructive/70">{report.error.message}</span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {actions.map((action, i) => {
          // UNSAFE: rendered inside the boundary's own fallback — wrapping again is circular.
          const Component = UNSAFE_unsealSlotComponent(action.component);
          return <Component key={i} report={report} context={context} />;
        })}
        <button className="underline hover:no-underline" onClick={retry}>
          Retry
        </button>
      </div>
    </Text>
  );
}

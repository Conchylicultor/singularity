import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { UNSAFE_unsealSlotComponent } from "@plugins/framework/plugins/web-sdk/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { ErrorBoundary } from "../slots";
import { boundaryReportSink, type BoundaryErrorReport } from "../reporter";

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
    // Defer one tick so plugin-side effects (e.g. boundaryReportSink.register)
    // have run if this boundary fired during the very first commit.
    const timer = setTimeout(() => {
      const result = boundaryReportSink.emit(report);
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
    // Single-line row: rigid identity → the ONE flexible <Fill> holding the
    // truncating message → rigid trailing actions. <Fill> absorbs the slack
    // (so actions stay flush-right, replacing ml-auto) AND lets the message
    // <Text> ellipsize under pressure — so a long message can never push the
    // Fix/Retry recovery actions off the clickable area. The full message
    // stays available via the native title tooltip.
    <Line className="gap-sm rounded-md border border-destructive/20 bg-destructive/10 px-md py-sm text-destructive">
      <Text variant="caption" className="font-medium">
        {tag || "Plugin"} crashed
      </Text>
      <Fill>
        <Text
          variant="caption"
          className="text-destructive/70"
          title={report.error.message}
        >
          {report.error.message}
        </Text>
      </Fill>
      {actions.map((action, i) => {
        // UNSAFE: rendered inside the boundary's own fallback — wrapping again is circular.
        const Component = UNSAFE_unsealSlotComponent(action.component);
        return <Component key={i} report={report} context={context} />;
      })}
      <Text
        as="button"
        variant="caption"
        className="underline hover:no-underline"
        onClick={retry}
      >
        Retry
      </Text>
    </Line>
  );
}

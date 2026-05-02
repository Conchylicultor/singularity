import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { Core } from "./slots";

interface Props {
  slot?: string;
  label?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export interface BoundaryErrorReport {
  error: Error;
  componentStack: string | null;
  slot: string | null;
  label: string | null;
}

export interface BoundaryReportResult {
  taskId: string | null;
}

type Reporter = (
  r: BoundaryErrorReport,
) => Promise<BoundaryReportResult | null | void> | void;

// Registered by the `crashes` plugin at mount time. Module-level callback
// avoids a hard import from plugin-core into a plugin; the reporter is
// optional and best-effort. May return a Promise resolving to the recorded
// crash's taskId so the fallback UI can offer task-scoped actions.
let reporter: Reporter | null = null;

export function registerBoundaryReporter(fn: Reporter | null): void {
  reporter = fn;
}

function callReporter(
  report: BoundaryErrorReport,
): Promise<BoundaryReportResult | null | void> | void {
  try {
    return reporter?.(report);
  } catch {
    return undefined;
  }
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
  const actions = Core.CrashAction.useContributions();
  const [taskId, setTaskId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Defer one tick so plugin-side effects (e.g. registerBoundaryReporter)
    // have run if this boundary fired during the very first commit.
    const timer = setTimeout(() => {
      const result = callReporter(report);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<BoundaryReportResult | null | void>)
          .then((r) => {
            if (!cancelled && r && r.taskId) setTaskId(r.taskId);
          })
          .catch(() => {
            // Never throw from the error path.
          });
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [report]);

  const tag = [report.slot, report.label].filter(Boolean).join(" / ");
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <span className="font-medium">{tag || "Plugin"} crashed</span>
      <span className="truncate text-destructive/70">{report.error.message}</span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {actions.map((action, i) => {
          const Component = action.component;
          return <Component key={i} report={report} taskId={taskId} />;
        })}
        <button className="underline hover:no-underline" onClick={retry}>
          Retry
        </button>
      </div>
    </div>
  );
}

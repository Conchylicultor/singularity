import { useEffect, useState } from "react";
import { traceWorkflow } from "./trace-workflow";
import type { TracedGraph, TraceStatus } from "./trace-types";

interface TraceState {
  graph: TracedGraph | null;
  status: TraceStatus;
}

/**
 * Trace-executes `script` and returns the recovered agent DAG. The trace is
 * async (the script body awaits), so this resolves on a microtask; `status`
 * is "tracing" for the first tick, then "ready" (graph present) or "fallback"
 * (no inline script, or the trace threw — caller renders the meta-only view).
 */
export function useWorkflowTrace(script: string, args: unknown): TraceState {
  const [state, setState] = useState<TraceState>({
    graph: null,
    status: script ? "tracing" : "fallback",
  });

  useEffect(() => {
    if (!script) {
      setState({ graph: null, status: "fallback" });
      return;
    }
    let cancelled = false;
    setState({ graph: null, status: "tracing" });
    void traceWorkflow(script, args).then((graph) => {
      if (cancelled) return;
      setState(
        graph ? { graph, status: "ready" } : { graph: null, status: "fallback" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [script, args]);

  return state;
}

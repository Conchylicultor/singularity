import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { ExcludeFromChangeFeed } from "@plugins/database/plugins/change-feed/server";
import { ExcludeFromFork } from "@plugins/database/plugins/admin/server";
import { traceConfig } from "../core";
import { listTraces, getTrace, testTrigger } from "../shared/endpoints";
import { handleListTraces, handleGetTrace } from "./internal/handlers";
import { handleTestTrigger } from "./internal/handle-test-trigger";
import { traceRetention } from "./internal/retention";
import { _traces } from "./internal/tables";

// The generic perf-event trace registry + captureTrace entry point.
export { defineTraceEventClass, TraceEventClass } from "./internal/registry";
export type {
  TraceEventClassSpec,
  TraceEventClassHandle,
} from "./internal/registry";
export { captureTrace } from "./internal/capture";
export { _traces } from "./internal/tables";

export default {
  description:
    "The generic slow-event trace engine: the TraceEventClass registry, captureTrace() admission + coherent-instant capture + async enrich/persist into the durable traces table, list/get endpoints, a daily 7-day sweep, and the test-trigger verification endpoint.",
  contributions: [
    ConfigV2.Register({ descriptor: traceConfig }),
    // A trace is inserted EXACTLY when a span tripped its slow threshold — i.e.
    // when the system is already under load. Wiring per-statement live-state
    // invalidation onto it would push a change-feed recompute cascade at the
    // worst possible moment and can self-amplify (slow app → more traces → more
    // notify → slower app) — the same recorded reason slow_ops is excluded. The
    // Slow Events list hydrates on open (GET /api/traces) instead of live-ticking.
    ExcludeFromChangeFeed({
      table: _traces,
      reason:
        "Written exactly when the system is slow; live-ticking it amplifies the very slowness it records. Slow Events list hydrates on open.",
    }),
    // A trace is 7-day debugging evidence about the machine that produced it,
    // reachable only from a report/timeline row filed in the SAME database. A
    // forked worktree inherits neither those pointers nor any reason to read
    // main's traces — and this is by far the largest table in the fork (722 MB
    // of a ~970 MB copy), so inheriting it is what made forking take minutes.
    ExcludeFromFork({
      table: _traces,
      reason:
        "Host-local 7-day debugging evidence; nothing in a fresh worktree points at main's traces, and it is the bulk of the fork's bytes.",
    }),
  ],
  httpRoutes: {
    [listTraces.route]: handleListTraces,
    [getTrace.route]: handleGetTrace,
    [testTrigger.route]: handleTestTrigger,
  },
  register: [traceRetention],
} satisfies ServerPluginDefinition;

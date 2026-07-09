// Server-only: install an AsyncLocalStorage-backed ambient-context runtime into
// the (otherwise pure) recorder. This file lives under server/ and is never
// imported by the web bundle, so it may freely use node:async_hooks. Importing
// it (via the server barrel, which the plugin registry loads at boot) installs
// the runtime before Bun.serve starts handling requests.

import { AsyncLocalStorage } from "node:async_hooks";
import { setProfilerHooks } from "@plugins/framework/plugins/server-core/core";
import {
  installSpanContextRuntime,
  installProfilingSuppressionRuntime,
  installBackgroundLaneRuntime,
  recordEntrySpan,
  recordSpan,
  chargeWait,
  getRuntimeProfile,
  getReadSetIndex,
  getLastLoaderReadSet,
  registerGateGauge,
  type EntryContext,
  type SpanKind,
  type GateGauge,
} from "../../core";

// Stores the EntryContext by identity: AsyncLocalStorage preserves the same
// object reference across the entry's async continuation, so a gate awaited deep
// inside a loader mutates the very wait map `recordEntrySpan` later reads.
const als = new AsyncLocalStorage<EntryContext>();

installSpanContextRuntime({
  run: (ctx, fn) => als.run(ctx, fn),
  current: () => als.getStore(),
});

// Separate ALS for the profiling-suppression scope. Backs runWithoutProfiling so
// the observability subsystem's own DB writes (reports/slow-ops inserts) never
// re-enter the recorder. AsyncLocalStorage propagates `true` across the awaited
// DB work spawned synchronously inside the scope, so the connection-acquire and
// query spans recorded by the pool wrapper during the await are suppressed too.
const suppressAls = new AsyncLocalStorage<true>();

installProfilingSuppressionRuntime({
  run: (fn) => suppressAls.run(true, fn),
  suppressed: () => suppressAls.getStore() === true,
});

// Separate ALS for the background-lane declaration. Backs runInBackgroundLane so
// the observability subsystem's own writes and the queue's job-cleanup writes are
// classified background whatever triggered them. AsyncLocalStorage propagates
// `true` across the awaited DB work spawned synchronously inside the scope — that
// propagation is exactly what routes a nested `db.transaction()`'s
// `pool.connect()` (and every query it awaits) into the background lane, rather
// than only the first synchronous statement.
const backgroundLaneAls = new AsyncLocalStorage<true>();

installBackgroundLaneRuntime({
  run: (fn) => backgroundLaneAls.run(true, fn),
  active: () => backgroundLaneAls.getStore() === true,
});

// Inject the profiler into server-core's resource runtime. server-core declares
// the seam (core/profiler-hooks.ts) with no-op defaults and never imports this
// plugin — inverting what would otherwise be a server-core ⇄ runtime-profiler
// cross-plugin cycle. The thin wrappers carry the profiler-internal types
// (SpanKind, GateGauge) that the widened seam deliberately omits.
setProfilerHooks({
  recordEntrySpan: <T>(kind: string, label: string, fn: () => T | Promise<T>): Promise<T> =>
    recordEntrySpan(kind as SpanKind, label, fn),
  recordSpan: (kind: string, label: string, durationMs: number): void =>
    recordSpan(kind as SpanKind, label, durationMs),
  chargeWait,
  getReadSetIndex,
  getLastLoaderReadSet,
  registerGateGauge: (layer: string, read: () => unknown): void =>
    registerGateGauge(layer, read as () => GateGauge),
  getRuntimeProfile: () => {
    const p = getRuntimeProfile();
    return { aggregates: { loader: p.aggregates.loader }, sinceMs: p.sinceMs };
  },
});

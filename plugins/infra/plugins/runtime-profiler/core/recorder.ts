// Zero-dependency, isomorphic runtime profiling recorder.
//
// This module imports NOTHING from other plugins (and no Node APIs) so it can
// sit at the very bottom of the dependency DAG. It is imported by
// `endpoints/core`, `database/server`, and `server-core/core` — all
// load-bearing — and must never form a back-edge that would create a cycle.
//
// The store is in-memory and bounded: per-(kind,label) rolling aggregates plus
// a small "slowest recent" ring per kind. Tiny and lost on restart, which is
// fine for live iterate-and-measure profiling.
//
// ## Ambient caller attribution
//
// Each `db`/`loader` span also records the single innermost enclosing request
// or loader it ran under (its immediate "parent"), so repeated-query (N+1)
// problems point straight at their source. The ambient context is supplied by
// an injected `SpanContextRuntime`: this module stays pure (no `node:async_hooks`,
// so the web bundle is unaffected); the server installs an AsyncLocalStorage-backed
// runtime at boot via `installSpanContextRuntime`. On the web the default no-op
// runtime makes every entry point a transparent passthrough.

export type SpanKind = "http" | "db" | "loader";

/** A reference to an enclosing entry point (the immediate parent of a span). */
export interface SpanRef {
  kind: SpanKind;
  label: string;
}

/** Per-parent breakdown of an aggregate: who issued this label, how often. */
export interface ParentBreakdown {
  parent: SpanRef;
  count: number;
  totalMs: number;
  maxMs: number;
}

export interface SlowSpan {
  kind: SpanKind;
  label: string;
  durationMs: number;
  atMs: number;
  /** Immediate enclosing request/loader, if any. */
  parent: SpanRef | null;
}

export type SlowSpanHandler = (span: SlowSpan) => void;

export interface Aggregate {
  label: string;
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  /** Attribution by immediate parent, sorted by count desc. */
  byParent: ParentBreakdown[];
}

const MAX_LABEL_LEN = 500;
const SLOWEST_CAP = 50;

const KINDS: readonly SpanKind[] = ["http", "db", "loader"];

// --- Injected ambient-context runtime ---

interface SpanContextRuntime {
  run<T>(ctx: SpanRef, fn: () => T): T;
  current(): SpanRef | undefined;
}

// Default: transparent passthrough with no ambient context (the web case, and
// the server before install.ts runs). The server replaces this at boot.
let contextRuntime: SpanContextRuntime = {
  run: (_ctx, fn) => fn(),
  current: () => undefined,
};

export function installSpanContextRuntime(runtime: SpanContextRuntime): void {
  contextRuntime = runtime;
}

// --- Injected profiling-suppression runtime ---
//
// The observability subsystem (reports, slow-ops) issues its own DB writes. Left
// unguarded, those writes are themselves `db` spans that the recorder aggregates
// and pushes to `onSlowSpan` — re-entering the very code that produced them, a
// self-amplifying feedback loop that storms the connection pool. The fix: an
// injected suppression scope (mirroring the SpanContextRuntime injection so core
// stays pure). Any span produced inside `runWithoutProfiling(fn)` is dropped at
// the top of `record()` before any aggregation or push work. The server installs
// an AsyncLocalStorage-backed runtime at boot; on the web the default no-op makes
// it a transparent passthrough.

interface ProfilingSuppressionRuntime {
  run<T>(fn: () => T): T;
  suppressed(): boolean;
}

let suppressionRuntime: ProfilingSuppressionRuntime = {
  run: (fn) => fn(),
  suppressed: () => false,
};

export function installProfilingSuppressionRuntime(
  rt: ProfilingSuppressionRuntime,
): void {
  suppressionRuntime = rt;
}

/**
 * Run `fn` in a scope where every span the recorder would otherwise capture is
 * dropped. Use this to wrap the observability subsystem's own I/O so the
 * profiler never measures itself. Suppression propagates to async continuations
 * spawned synchronously within `fn` (AsyncLocalStorage semantics on the server),
 * so an awaited DB operation kicked off inside `fn` is fully suppressed.
 */
export function runWithoutProfiling<T>(fn: () => T): T {
  return suppressionRuntime.run(fn);
}

// --- Slow-span push seam ---

// The push counterpart to the pull-only getRuntimeProfile(). Subscribers are
// notified synchronously from record() for any span at/over their thresholdMs.
const slowSpanSubs: { thresholdMs: number; handler: SlowSpanHandler }[] = [];

/**
 * Subscribe to spans whose duration meets `thresholdMs`. This is the push seam
 * consumed by the `reports` plugin to file slow-op reports. The static
 * `thresholdMs` is a coarse performance floor so the hot path never calls back
 * for fast spans; consumers still do final per-kind gating in their handler.
 * Returns a disposer that unsubscribes.
 */
export function onSlowSpan(
  handler: SlowSpanHandler,
  opts: { thresholdMs: number },
): { dispose: () => void } {
  const sub = { thresholdMs: opts.thresholdMs, handler };
  slowSpanSubs.push(sub);
  return {
    dispose: () => {
      const i = slowSpanSubs.indexOf(sub);
      if (i >= 0) slowSpanSubs.splice(i, 1);
    },
  };
}

// --- Store ---

// Internal aggregate keeps byParent as a Map for O(1) updates; materialized to
// a sorted array in getRuntimeProfile().
interface AggregateInternal {
  label: string;
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  byParent: Map<string, ParentBreakdown>;
}

// Per-kind aggregate maps keyed by label.
const aggregates: Record<SpanKind, Map<string, AggregateInternal>> = {
  http: new Map(),
  db: new Map(),
  loader: new Map(),
};

// Per-kind "slowest recent" buffer. We keep a slowest-N set rather than a plain
// recency ring: the question this surfaces is "what was the worst recently",
// and a slowest-N answers that directly. Implementation: append, then if over
// the cap drop the single fastest entry. O(n) per insert with n<=50 is trivial.
const slowest: Record<SpanKind, SlowSpan[]> = {
  http: [],
  db: [],
  loader: [],
};

let sinceMs = performance.now();

function parentKey(parent: SpanRef): string {
  return `${parent.kind}:${parent.label}`;
}

// Core write path: update aggregates + slowest ring, attributing to `parent`.
function record(
  kind: SpanKind,
  label: string,
  durationMs: number,
  parent: SpanRef | null,
): void {
  if (process.env.SINGULARITY_PROFILING === "0") return;
  // Drop spans produced inside a runWithoutProfiling scope before any aggregate,
  // slowest-ring, or onSlowSpan work — this is what breaks the observability
  // self-feedback loop (see installProfilingSuppressionRuntime).
  if (suppressionRuntime.suppressed()) return;

  const cappedLabel = label.length > MAX_LABEL_LEN ? label.slice(0, MAX_LABEL_LEN) : label;

  const byLabel = aggregates[kind];
  let agg = byLabel.get(cappedLabel);
  if (agg) {
    agg.count += 1;
    agg.totalMs += durationMs;
    agg.lastMs = durationMs;
    if (durationMs > agg.maxMs) agg.maxMs = durationMs;
  } else {
    agg = {
      label: cappedLabel,
      count: 1,
      totalMs: durationMs,
      maxMs: durationMs,
      lastMs: durationMs,
      byParent: new Map(),
    };
    byLabel.set(cappedLabel, agg);
  }

  if (parent) {
    const pk = parentKey(parent);
    const pb = agg.byParent.get(pk);
    if (pb) {
      pb.count += 1;
      pb.totalMs += durationMs;
      if (durationMs > pb.maxMs) pb.maxMs = durationMs;
    } else {
      agg.byParent.set(pk, {
        parent: { kind: parent.kind, label: parent.label },
        count: 1,
        totalMs: durationMs,
        maxMs: durationMs,
      });
    }
  }

  const atMs = performance.now();
  const ring = slowest[kind];
  ring.push({ kind, label: cappedLabel, durationMs, atMs, parent });
  if (ring.length > SLOWEST_CAP) {
    // Drop the single fastest entry to keep the slowest N.
    let minIdx = 0;
    for (let i = 1; i < ring.length; i++) {
      if (ring[i]!.durationMs < ring[minIdx]!.durationMs) minIdx = i;
    }
    ring.splice(minIdx, 1);
  }

  // Push seam: notify subscribers past their floor. Only build the span when
  // someone is listening to keep the hot path cheap. The handler is a
  // non-throwing fire-and-forget scheduler, so we don't guard it — failing
  // loudly is correct per repo policy.
  if (slowSpanSubs.length > 0) {
    const span: SlowSpan = { kind, label: cappedLabel, durationMs, atMs, parent };
    for (const sub of slowSpanSubs) {
      if (durationMs >= sub.thresholdMs) sub.handler(span);
    }
  }
}

/**
 * Record a leaf span (e.g. a DB query), attributed to the innermost enclosing
 * entry point if one is active. Used by the DB pool wrapper.
 */
export function recordSpan(kind: SpanKind, label: string, durationMs: number): void {
  record(kind, label, durationMs, contextRuntime.current() ?? null);
}

/**
 * Run `fn` as an entry point of the given kind/label: children executed inside
 * `fn` see `{ kind, label }` as their ambient parent, while the entry span
 * itself is recorded against the *outer* parent (so an entry is never its own
 * parent). Used at the HTTP and loader chokepoints.
 */
export async function recordEntrySpan<T>(
  kind: SpanKind,
  label: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const parent = contextRuntime.current() ?? null;
  const t0 = performance.now();
  try {
    return await contextRuntime.run({ kind, label }, fn);
  } finally {
    record(kind, label, performance.now() - t0, parent);
  }
}

export function getRuntimeProfile(): {
  aggregates: Record<SpanKind, Aggregate[]>;
  slowest: Record<SpanKind, SlowSpan[]>;
  sinceMs: number;
} {
  const aggOut = {} as Record<SpanKind, Aggregate[]>;
  const slowOut = {} as Record<SpanKind, SlowSpan[]>;
  for (const kind of KINDS) {
    aggOut[kind] = Array.from(aggregates[kind].values())
      .map((agg) => ({
        label: agg.label,
        count: agg.count,
        totalMs: agg.totalMs,
        maxMs: agg.maxMs,
        lastMs: agg.lastMs,
        byParent: Array.from(agg.byParent.values()).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.maxMs - a.maxMs);
    // Most-recent-slowest first: sort the slowest-N buffer by duration desc.
    slowOut[kind] = [...slowest[kind]].sort((a, b) => b.durationMs - a.durationMs);
  }
  return { aggregates: aggOut, slowest: slowOut, sinceMs };
}

export function resetRuntimeProfile(): void {
  for (const kind of KINDS) {
    aggregates[kind].clear();
    slowest[kind].length = 0;
  }
  sinceMs = performance.now();
}

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

// `http` / `db` / `loader` are spans of real work. `sub` / `push` are *origin*
// entries: the WS-subscription ack and the cascade/push flush that trigger a
// loader. They exist so a loader run is never `parent: null` — the loader span's
// parent names the request class that triggered it (sub = a tab subscribed,
// push = a notify cascade), making head-of-line blocking attributable to its
// origin. `flush` is the live-state notify-flush cycle: each `flushNotifies`
// drain runs inside a `flush` entry, so the per-resource `push` loads it triggers
// nest under it — `aggregates.flush[*].byParent` is the head-of-line attribution
// (which resource dominated a flush cycle) for free. See
// research/2026-06-19-global-wait-attribution-instrumentation.md and
// research/2026-06-19-global-observability-frequency-delivery-and-dead-job-gc.md.
export type SpanKind = "http" | "db" | "loader" | "sub" | "push" | "flush";

/** A reference to an enclosing entry point (the immediate parent of a span). */
export interface SpanRef {
  kind: SpanKind;
  label: string;
}

/**
 * Per-layer wait breakdown charged to an entry while it ran: gate/lock name →
 * accumulated ms. Lets an entry span report pure operation cost (work = total −
 * Σwaits) and makes lock-vs-work readable directly, attributed to the resource
 * that waited. Populated via `chargeWait` from each concurrency gate.
 */
export type WaitBreakdown = Record<string, number>;

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
  /** Wait charged to this entry by layer, if it waited (entry spans only). */
  waits?: WaitBreakdown;
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
  /** Summed wait by layer across all records of this label, if any waited. */
  waits?: WaitBreakdown;
}

const MAX_LABEL_LEN = 500;
const SLOWEST_CAP = 50;

const KINDS: readonly SpanKind[] = ["http", "db", "loader", "sub", "push", "flush"];

// --- Injected ambient-context runtime ---

/**
 * The mutable ambient entry context: the innermost enclosing entry's identity
 * plus a per-layer wait accumulator. A gate charges its queue-wait here (via
 * `chargeWait`) while the entry runs; `recordEntrySpan` materializes the map
 * into the entry's `waits` on finish. Stored by identity in the server's
 * AsyncLocalStorage, so a gate awaited deep inside the entry mutates the SAME
 * map — this is why per-entry wait accumulation works without threading state.
 */
export interface EntryContext {
  kind: SpanKind;
  label: string;
  waits: Map<string, number>;
}

interface SpanContextRuntime {
  run<T>(ctx: EntryContext, fn: () => T): T;
  current(): EntryContext | undefined;
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
  /** Summed wait by layer, lazily created the first time a record waits. */
  waits?: WaitBreakdown;
}

// Per-kind aggregate maps keyed by label.
const aggregates: Record<SpanKind, Map<string, AggregateInternal>> = {
  http: new Map(),
  db: new Map(),
  loader: new Map(),
  sub: new Map(),
  push: new Map(),
  flush: new Map(),
};

// Per-kind "slowest recent" buffer. We keep a slowest-N set rather than a plain
// recency ring: the question this surfaces is "what was the worst recently",
// and a slowest-N answers that directly. Implementation: append, then if over
// the cap drop the single fastest entry. O(n) per insert with n<=50 is trivial.
const slowest: Record<SpanKind, SlowSpan[]> = {
  http: [],
  db: [],
  loader: [],
  sub: [],
  push: [],
  flush: [],
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
  waits?: WaitBreakdown,
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

  // Sum the entry's per-layer wait into the aggregate so a label's wait-vs-work
  // split is durable across all its records, not just the latest.
  if (waits) {
    agg.waits ??= {};
    for (const layer in waits) {
      agg.waits[layer] = (agg.waits[layer] ?? 0) + waits[layer]!;
    }
  }

  const atMs = performance.now();
  const ring = slowest[kind];
  ring.push({ kind, label: cappedLabel, durationMs, atMs, parent, waits });
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
    const span: SlowSpan = { kind, label: cappedLabel, durationMs, atMs, parent, waits };
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
  const cur = contextRuntime.current();
  record(kind, label, durationMs, cur ? { kind: cur.kind, label: cur.label } : null);
}

/**
 * Charge `ms` of wait time, under layer name `layer`, to the innermost enclosing
 * entry (loader/http/sub/push). A concurrency gate calls this from its `onWait`
 * callback when it makes the current entry queue, so the wait lands ON the
 * waiting resource's own span (work = total − Σwaits, lock-vs-work readable
 * directly) instead of in a label-shared bucket. If no entry is active
 * (context-less: jobs, pollers, migrations), fall back to a standalone `db` span
 * so the wait is never silently lost. Read+charge synchronously at slot
 * acquisition, while the ambient context is still active.
 */
export function chargeWait(layer: string, ms: number): void {
  const cur = contextRuntime.current();
  if (cur) {
    cur.waits.set(layer, (cur.waits.get(layer) ?? 0) + ms);
  } else {
    record("db", `[${layer}]`, ms, null);
  }
}

/**
 * The kind of the innermost enclosing entry point at the current call site, or
 * `undefined` when none is active (e.g. a background job, migration, or poller).
 * A thin read of the same ambient context `recordEntrySpan` maintains — the DB
 * pool wrapper uses it to gate loader-originated queries (caps background load
 * below the pool `max` so interactive work keeps reserved connections) without
 * the runtime needing a separate cost-class taxonomy. Must be read synchronously
 * (before any await) so the ambient context is still active.
 */
export function currentCallerKind(): SpanKind | undefined {
  return contextRuntime.current()?.kind;
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
  const cur = contextRuntime.current();
  const parent: SpanRef | null = cur ? { kind: cur.kind, label: cur.label } : null;
  // Fresh accumulator per entry: nested entries (loader inside sub/http) each
  // own their wait map, so a gate charges only the innermost one — no double
  // counting up the chain.
  const ctx: EntryContext = { kind, label, waits: new Map() };
  const t0 = performance.now();
  try {
    return await contextRuntime.run(ctx, fn);
  } finally {
    const waits = ctx.waits.size > 0 ? Object.fromEntries(ctx.waits) : undefined;
    record(kind, label, performance.now() - t0, parent, waits);
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
        waits: agg.waits ? { ...agg.waits } : undefined,
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

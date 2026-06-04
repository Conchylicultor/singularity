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

  const ring = slowest[kind];
  ring.push({ kind, label: cappedLabel, durationMs, atMs: performance.now(), parent });
  if (ring.length > SLOWEST_CAP) {
    // Drop the single fastest entry to keep the slowest N.
    let minIdx = 0;
    for (let i = 1; i < ring.length; i++) {
      if (ring[i]!.durationMs < ring[minIdx]!.durationMs) minIdx = i;
    }
    ring.splice(minIdx, 1);
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

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

export type SpanKind = "http" | "db" | "loader";

export interface SlowSpan {
  kind: SpanKind;
  label: string;
  durationMs: number;
  atMs: number;
}

export interface Aggregate {
  label: string;
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
}

const MAX_LABEL_LEN = 500;
const SLOWEST_CAP = 50;

const KINDS: readonly SpanKind[] = ["http", "db", "loader"];

// Per-kind aggregate maps keyed by label.
const aggregates: Record<SpanKind, Map<string, Aggregate>> = {
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

export function recordSpan(kind: SpanKind, label: string, durationMs: number): void {
  if (process.env.SINGULARITY_PROFILING === "0") return;

  const cappedLabel = label.length > MAX_LABEL_LEN ? label.slice(0, MAX_LABEL_LEN) : label;

  const byLabel = aggregates[kind];
  const existing = byLabel.get(cappedLabel);
  if (existing) {
    existing.count += 1;
    existing.totalMs += durationMs;
    existing.lastMs = durationMs;
    if (durationMs > existing.maxMs) existing.maxMs = durationMs;
  } else {
    byLabel.set(cappedLabel, {
      label: cappedLabel,
      count: 1,
      totalMs: durationMs,
      maxMs: durationMs,
      lastMs: durationMs,
    });
  }

  const ring = slowest[kind];
  ring.push({ kind, label: cappedLabel, durationMs, atMs: performance.now() });
  if (ring.length > SLOWEST_CAP) {
    // Drop the single fastest entry to keep the slowest N.
    let minIdx = 0;
    for (let i = 1; i < ring.length; i++) {
      if (ring[i]!.durationMs < ring[minIdx]!.durationMs) minIdx = i;
    }
    ring.splice(minIdx, 1);
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
    aggOut[kind] = Array.from(aggregates[kind].values()).sort(
      (a, b) => b.maxMs - a.maxMs,
    );
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

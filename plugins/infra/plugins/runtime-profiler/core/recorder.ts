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
//
// ## Wall-clock decomposition (wait / child / self)
//
// Every entry span decomposes its wall-clock into `waitMs` (time spent queued
// on named gates/pools, at any depth of its subtree), `childMs` (time covered
// by direct-child entry spans), and `selfMs` (the remainder: its own
// orchestration/CPU). Gate waits propagate to EVERY open ancestor — not just
// the innermost entry — so a composite span (e.g. a `flush` draining many
// loaders) names the gates its subtree waited on instead of showing a huge
// wall-clock with empty `waits`.
//
// The load-bearing constraint is concurrency: a flush drains many loaders in
// parallel, so SUMMING child waits into an ancestor can exceed the ancestor's
// wall-clock (20 loaders × 60s gate wait inside a 90s flush would read as
// "1200s of wait"). Each ancestor therefore accumulates waits as an
// interval-UNION over its own timeline (`Track`), guaranteeing
// `waitMs ≤ wall` and `selfMs ≥ 0` at every level. Because every charge
// arrives at its interval's END time (gates call `onWait` at slot acquisition;
// children charge at finish), the charge stream is end-ordered by
// construction, so a streaming union — O(1) state per track, no interval list
// — is exact for these streams; an interval that reaches back before the
// track's covered frontier contributes only the part past it (conservative:
// never overcounts, so `selfMs` can never go negative).
//
// A finished child charges its execution interval into the NEAREST open
// ancestor only: each parent's own interval propagates upward when *it*
// finishes, so charging every ancestor would double-count grandchildren.
// Gate waits, by contrast, go to ALL open ancestors — a union is idempotent
// under re-covering the same time range, so the same wait interval landing in
// every level is exactly what makes each level's `waits` self-contained.

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
// `job` is a top-level background-work entry recorded around each
// graphile-worker `job.run()`, analogous to `http` but triggered by the queue
// rather than an incoming request; its label is the job name.
export type SpanKind = "http" | "db" | "loader" | "sub" | "push" | "flush" | "job";

/** A reference to an enclosing entry point (the immediate parent of a span). */
export interface SpanRef {
  kind: SpanKind;
  label: string;
}

/**
 * Per-layer wait breakdown charged to an entry while it ran: gate/lock name →
 * ms of the entry's own timeline covered by waits on that layer (an interval
 * UNION per record, so each value is ≤ the record's wall-clock — never a sum
 * across concurrent waiters). Populated via `chargeWait` from each concurrency
 * gate; propagated to every open ancestor entry.
 */
export type WaitBreakdown = Record<string, number>;

/**
 * A streaming interval-union accumulator over one entry's timeline.
 * `prevEnd` is the covered frontier: because charges arrive end-ordered (see
 * module header), everything at/before `prevEnd` that will ever be covered
 * already is, so a single scalar suffices — no interval list.
 */
export interface Track {
  unionMs: number;
  prevEnd: number;
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
  /** Wait charged to this entry by layer, if it waited (entry spans only). */
  waits?: WaitBreakdown;
  /** Union of all gate waits over this span's timeline (0 for leaf spans). */
  waitMs: number;
  /** Union of direct-child entry executions over this span's timeline (0 for leaves). */
  childMs: number;
  /** durationMs − union(waits ∪ child executions): own orchestration/CPU. Leaves: durationMs. */
  selfMs: number;
}

export type SlowSpanHandler = (span: SlowSpan) => void;

export interface Aggregate {
  label: string;
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  /** Σ per-record waitMs (each a union ≤ that record's wall). Per-call avg = /count. */
  waitTotalMs: number;
  /** Σ per-record childMs. */
  childTotalMs: number;
  /** Σ per-record selfMs. */
  selfTotalMs: number;
  /** Max duration within the recent rolling window (~5 min). 0 if idle past the window. */
  recentMaxMs: number;
  /** How long ago the all-time `maxMs` was set — so a stale peak reads as stale. */
  maxAgeMs: number;
  /** Attribution by immediate parent, sorted by count desc. */
  byParent: ParentBreakdown[];
  /** Summed per-record wait unions by layer across all records of this label, if any waited. */
  waits?: WaitBreakdown;
}

/**
 * Split an aggregate's average per-call duration into wait / child / self.
 * The `*TotalMs` fields are SUMMED across every record of the label (see
 * `record()`), so dividing by `count` amortizes each component per call.
 * Returns RAW floats (no rounding) — callers format. Per-record each component
 * is an interval union ≤ wall, so `waitMs ≤ avgMs` and `selfMs ≥ 0` hold on
 * the averages too.
 */
export function waitSplit(agg: Aggregate): {
  avgMs: number;
  waitMs: number;
  childMs: number;
  selfMs: number;
  waits: Record<string, number>;
} {
  const avgMs = agg.totalMs / agg.count;
  const waits: Record<string, number> = {};
  if (agg.waits) {
    for (const layer in agg.waits) {
      waits[layer] = agg.waits[layer]! / agg.count;
    }
  }
  return {
    avgMs,
    waitMs: agg.waitTotalMs / agg.count,
    childMs: agg.childTotalMs / agg.count,
    selfMs: agg.selfTotalMs / agg.count,
    waits,
  };
}

const MAX_LABEL_LEN = 500;
const SLOWEST_CAP = 50;

// Rolling-max window: per-aggregate max durations are bucketed into
// BUCKET_MS-wide bins; `recentMaxMs` is the max over the last WINDOW_BUCKETS
// live bins (~5 min). Bounded at O(WINDOW_BUCKETS) per aggregate.
const BUCKET_MS = 30_000;
const WINDOW_BUCKETS = 10;

const KINDS: readonly SpanKind[] = ["http", "db", "loader", "sub", "push", "flush", "job"];

// --- Injected clock ---

// Single clock seam used by every timestamp in this module (record, chargeWait,
// recordEntrySpan, getRuntimeProfile). Injectable so union/bucket arithmetic is
// deterministic under test; default behavior identical to performance.now().
let now: () => number = () => performance.now();

export function installClock(fn: () => number): void {
  now = fn;
}

// --- Streaming interval union ---

// Contribute the interval [start, end] to a track. `floor` clips the interval
// to the owning context's lifetime (a wait that started before the entry did
// must not count against the entry's wall-clock). The frontier check makes it
// a union, not a sum: only time past `prevEnd` is new coverage. An interval
// fully at/before the frontier contributes 0 — with end-ordered arrival this
// means "already covered"; in the theoretical non-end-ordered case it
// undercounts, never overcounts (so selfMs stays ≥ 0).
function contribute(track: Track, start: number, end: number, floor: number): void {
  if (start < floor) start = floor;
  const lo = start > track.prevEnd ? start : track.prevEnd;
  if (end > lo) {
    track.unionMs += end - lo;
    track.prevEnd = end;
  }
}

// Test-only export: the streaming union is the load-bearing math of the whole
// decomposition, so it is unit-tested directly. Not part of the public API.
export { contribute as __contribute };

// --- Injected ambient-context runtime ---

/**
 * The mutable ambient entry context: the innermost enclosing entry's identity
 * plus its live parent chain and interval-union accumulators. A gate charges
 * its queue-wait here (via `chargeWait`) while the entry runs — into this
 * context AND every open ancestor up the chain; `recordEntrySpan` materializes
 * the unions into `waits`/`waitMs`/`childMs`/`selfMs` on finish. Stored by
 * identity in the server's AsyncLocalStorage, so a gate awaited deep inside
 * the entry mutates the SAME tracks — this is why per-entry wait accumulation
 * works without threading state.
 */
export interface EntryContext {
  kind: SpanKind;
  label: string;
  /**
   * The live enclosing entry chain (unlike the `SpanRef` snapshot `record()`
   * attributes to, these are the mutable contexts wait/child intervals
   * propagate into). `undefined` at the top level.
   */
  parent: EntryContext | undefined;
  /** Entry start on the profiler clock; the clip floor for all its tracks. */
  startMs: number;
  /**
   * Set in `recordEntrySpan`'s finally, after the entry recorded itself. A
   * closed context must never be mutated again: a detached child (or a late
   * gate callback) finishing after its parent closed would otherwise write
   * into unions the parent already materialized — silently lost at best,
   * corrupting a reused timeline at worst. Walkers skip closed ancestors.
   */
  closed: boolean;
  /** Per-gate-layer wait unions → materialized into the record's `waits`. */
  layerUnions: Map<string, Track>;
  /** Union of ALL gate-wait intervals (across layers) → `waitMs`. */
  waitUnion: Track;
  /** Union of gate-waits ∪ child executions → `selfMs = wall − busy`. */
  busyUnion: Track;
  /** Union of direct-child entry execution intervals → `childMs`. */
  childUnion: Track;
  /**
   * The set of DB tables this entry read, lazily created on first
   * `recordReadTables` (unlike the tracks, which are always allocated).
   * Materialized into `readSetIndex` by `recordEntrySpan` for loader entries
   * only, so the many non-loader entries that never read tables don't allocate
   * a Set.
   */
  tables?: Set<string>;
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
  /** Profiler-clock timestamp of the record that set (or last beat) maxMs. */
  maxAtMs: number;
  lastMs: number;
  waitTotalMs: number;
  childTotalMs: number;
  selfTotalMs: number;
  /**
   * Per-bucket max durations for the rolling recent-max window. `at` is the
   * bucket index (atMs / BUCKET_MS); records within the same bucket fold into
   * one entry, and expired entries are dropped on append — bounded at
   * O(WINDOW_BUCKETS).
   */
  recentBuckets: { at: number; max: number }[];
  byParent: Map<string, ParentBreakdown>;
  /** Summed per-record wait unions by layer, lazily created on first wait. */
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
  job: new Map(),
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
  job: [],
};

let sinceMs = now();

// Automatic loader→table read-set index: each loader entry's captured `tables`
// set is unioned in here under its `label` (which, for loader entries, IS the
// resource key) when the entry finishes. Built up via `recordReadTables` mid-load
// and flushed in `recordEntrySpan`'s finally; surfaced by `getReadSetIndex`.
const readSetIndex = new Map<string, Set<string>>();

function parentKey(parent: SpanRef): string {
  return `${parent.kind}:${parent.label}`;
}

// Core write path: update aggregates + slowest ring, attributing to `parent`.
// `waitMs`/`childMs`/`selfMs` are the entry's decomposition (see module
// header); leaf spans take the defaults (no waits, no children, all self).
function record(
  kind: SpanKind,
  label: string,
  durationMs: number,
  parent: SpanRef | null,
  waits?: WaitBreakdown,
  waitMs = 0,
  childMs = 0,
  selfMs = durationMs,
): void {
  if (process.env.SINGULARITY_PROFILING === "0") return;
  // Drop spans produced inside a runWithoutProfiling scope before any aggregate,
  // slowest-ring, or onSlowSpan work — this is what breaks the observability
  // self-feedback loop (see installProfilingSuppressionRuntime).
  if (suppressionRuntime.suppressed()) return;

  const cappedLabel = label.length > MAX_LABEL_LEN ? label.slice(0, MAX_LABEL_LEN) : label;
  const atMs = now();

  const byLabel = aggregates[kind];
  let agg = byLabel.get(cappedLabel);
  if (agg) {
    agg.count += 1;
    agg.totalMs += durationMs;
    agg.lastMs = durationMs;
    agg.waitTotalMs += waitMs;
    agg.childTotalMs += childMs;
    agg.selfTotalMs += selfMs;
    if (durationMs > agg.maxMs) {
      agg.maxMs = durationMs;
      agg.maxAtMs = atMs;
    }
  } else {
    agg = {
      label: cappedLabel,
      count: 1,
      totalMs: durationMs,
      maxMs: durationMs,
      maxAtMs: atMs,
      lastMs: durationMs,
      waitTotalMs: waitMs,
      childTotalMs: childMs,
      selfTotalMs: selfMs,
      recentBuckets: [],
      byParent: new Map(),
    };
    byLabel.set(cappedLabel, agg);
  }

  // Rolling recent-max: fold into the current bucket, or open a new one and
  // evict everything that has left the window. Eviction only happens on bucket
  // rollover, so an idle aggregate keeps stale buckets — getRuntimeProfile()
  // filters by liveness against the CURRENT time, so they never leak into
  // recentMaxMs.
  const bucketIdx = Math.floor(atMs / BUCKET_MS);
  const buckets = agg.recentBuckets;
  const lastBucket = buckets[buckets.length - 1];
  if (lastBucket && lastBucket.at === bucketIdx) {
    if (durationMs > lastBucket.max) lastBucket.max = durationMs;
  } else {
    buckets.push({ at: bucketIdx, max: durationMs });
    while (buckets.length > 0 && buckets[0]!.at <= bucketIdx - WINDOW_BUCKETS) {
      buckets.shift();
    }
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

  // Sum the entry's per-layer wait into the aggregate so a label's wait split
  // is durable across all its records, not just the latest. Each incoming
  // value is a per-record union (≤ that record's wall), so the summed value
  // divided by count stays a meaningful per-call average.
  if (waits) {
    agg.waits ??= {};
    for (const layer in waits) {
      agg.waits[layer] = (agg.waits[layer] ?? 0) + waits[layer]!;
    }
  }

  const ring = slowest[kind];
  ring.push({ kind, label: cappedLabel, durationMs, atMs, parent, waits, waitMs, childMs, selfMs });
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
    const span: SlowSpan = {
      kind,
      label: cappedLabel,
      durationMs,
      atMs,
      parent,
      waits,
      waitMs,
      childMs,
      selfMs,
    };
    for (const sub of slowSpanSubs) {
      if (durationMs >= sub.thresholdMs) sub.handler(span);
    }
  }
}

/**
 * Record a leaf span (e.g. a DB query), attributed to the innermost enclosing
 * entry point if one is active. Used by the DB pool wrapper. A leaf has no
 * decomposition: waitMs/childMs default to 0, selfMs to the full duration.
 */
export function recordSpan(kind: SpanKind, label: string, durationMs: number): void {
  const cur = contextRuntime.current();
  record(kind, label, durationMs, cur ? { kind: cur.kind, label: cur.label } : null);
}

/**
 * Charge `ms` of wait time, under layer name `layer`, to EVERY open enclosing
 * entry (innermost included). A concurrency gate calls this from its `onWait`
 * callback at slot acquisition, so the interval `[now − ms, now]` is exact and
 * arrives end-ordered (the invariant the streaming union relies on). Each open
 * ancestor unions the interval into its own per-layer track, `waitUnion`, and
 * `busyUnion` — so a composite entry (flush) sees the gates its subtree waited
 * on, while concurrent waiters can never push an ancestor's wait past its
 * wall-clock. Closed ancestors are skipped (already recorded — see
 * `EntryContext.closed`); the interval is clipped to each ancestor's own start.
 *
 * A zero-ms charge still creates the layer key (with 0): git-memo hit/miss
 * markers use this to surface *that* a layer was consulted, not just how long
 * it blocked.
 *
 * If no entry is active (context-less: jobs, pollers, migrations), fall back
 * to a standalone `db [layer]` span so the wait is never silently lost.
 * Suppression is honored here (unlike the old innermost-only version) because
 * a wait incurred inside `runWithoutProfiling` would otherwise pollute the
 * unions of ancestors whose own records are NOT suppressed.
 */
export function chargeWait(layer: string, ms: number): void {
  if (process.env.SINGULARITY_PROFILING === "0") return;
  if (suppressionRuntime.suppressed()) return;
  const cur = contextRuntime.current();
  if (!cur) {
    record("db", `[${layer}]`, ms, null);
    return;
  }
  const end = now();
  const start = end - ms;
  for (let a: EntryContext | undefined = cur; a; a = a.parent) {
    if (a.closed) continue;
    let track = a.layerUnions.get(layer);
    if (!track) {
      track = { unionMs: 0, prevEnd: a.startMs };
      a.layerUnions.set(layer, track);
    }
    contribute(track, start, end, a.startMs);
    contribute(a.waitUnion, start, end, a.startMs);
    contribute(a.busyUnion, start, end, a.startMs);
  }
}

/**
 * Capture the loader's table read-set into the ambient `EntryContext`. The DB
 * pool wrapper calls this with the tables a loader query touched (extracted from
 * the compiled SQL) while the loader's ambient context is still active. The names
 * accumulate on `cur.tables` (lazily created — read-set only applies to entries
 * that actually query) and are flushed into `readSetIndex` by `recordEntrySpan`
 * when the loader entry finishes. If no entry is active, do nothing: a read-set
 * only makes sense inside an entry. Read+charge synchronously, before any await,
 * so the ambient context is still active.
 *
 * Honors `runWithoutProfiling` suppression for the same reason `record` does:
 * the observability subsystem (reports, slow-ops) issues its own DB writes
 * synchronously inside a slow-span handler — i.e. inside whatever loader
 * triggered the slow span. Without this guard those suppressed writes (e.g.
 * `INSERT INTO reports`, the report's `createTask`/`getTask`) would be
 * mis-attributed to that loader's read-set, fabricating dependency edges.
 */
export function recordReadTables(tables: readonly string[]): void {
  if (process.env.SINGULARITY_PROFILING === "0") return;
  if (suppressionRuntime.suppressed()) return;
  const cur = contextRuntime.current();
  if (cur) {
    cur.tables ??= new Set();
    for (const table of tables) cur.tables.add(table);
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
 * `fn` see this entry as their ambient parent, while the entry span itself is
 * recorded against the *outer* parent (so an entry is never its own parent).
 * Used at the HTTP and loader chokepoints.
 *
 * On finish (`finally`), the entry:
 * 1. charges its own execution interval `[t0, t1]` into the NEAREST open
 *    ancestor's `childUnion` + `busyUnion` — nearest only, because each
 *    ancestor's own interval propagates upward when IT finishes; charging
 *    every ancestor would double-count grandchild time;
 * 2. closes its context so late detached work can never mutate it;
 * 3. records with the materialized decomposition: `waitMs` (union of all gate
 *    waits), `childMs` (union of direct-child executions), and
 *    `selfMs = max(0, wall − busyUnion)` — busy is the union of waits AND
 *    child executions, so overlapping wait/child time is not subtracted twice.
 */
export async function recordEntrySpan<T>(
  kind: SpanKind,
  label: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const cur = contextRuntime.current();
  const parent: SpanRef | null = cur ? { kind: cur.kind, label: cur.label } : null;
  const t0 = now();
  // Fresh accumulators per entry, chained to the live parent context: a gate
  // charge deep inside `fn` walks this chain and unions into every open level.
  // All tracks start their frontier at t0 so pre-entry time can never count.
  const ctx: EntryContext = {
    kind,
    label,
    parent: cur,
    startMs: t0,
    closed: false,
    layerUnions: new Map(),
    waitUnion: { unionMs: 0, prevEnd: t0 },
    busyUnion: { unionMs: 0, prevEnd: t0 },
    childUnion: { unionMs: 0, prevEnd: t0 },
  };
  try {
    return await contextRuntime.run(ctx, fn);
  } finally {
    const t1 = now();
    // (1) Propagate this entry's execution interval to the nearest OPEN
    // ancestor only (see doc comment). Skipping closed ancestors keeps a
    // detached child (finishing after its parent already recorded) from
    // mutating a finished timeline; if everything up the chain is closed, the
    // interval is dropped — conservative, the ancestors' records are final.
    for (let a: EntryContext | undefined = ctx.parent; a; a = a.parent) {
      if (a.closed) continue;
      contribute(a.childUnion, t0, t1, a.startMs);
      contribute(a.busyUnion, t0, t1, a.startMs);
      break;
    }
    // (2) Close before recording so nothing can race a mutation in between.
    ctx.closed = true;
    // (3) Materialize the decomposition and record.
    const wall = t1 - t0;
    const waitMs = ctx.waitUnion.unionMs;
    const childMs = ctx.childUnion.unionMs;
    const selfMs = Math.max(0, wall - ctx.busyUnion.unionMs);
    let waits: WaitBreakdown | undefined;
    if (ctx.layerUnions.size > 0) {
      waits = {};
      for (const [layer, track] of ctx.layerUnions) waits[layer] = track.unionMs;
    }
    record(kind, label, wall, parent, waits, waitMs, childMs, selfMs);
    // Flush the loader's captured table read-set into the index, keyed by label
    // (the resource key). Gating on `loader` kind means a stray table captured
    // under a non-loader entry is never indexed. Done after `record` so it can
    // never affect span recording.
    if (kind === "loader" && ctx.tables && ctx.tables.size > 0) {
      let set = readSetIndex.get(label);
      if (!set) {
        set = new Set();
        readSetIndex.set(label, set);
      }
      for (const table of ctx.tables) set.add(table);
    }
  }
}

export function getRuntimeProfile(): {
  aggregates: Record<SpanKind, Aggregate[]>;
  slowest: Record<SpanKind, SlowSpan[]>;
  sinceMs: number;
} {
  const nowMs = now();
  // A bucket is live while its index is within the window of the CURRENT
  // bucket index — matching the eviction rule in record(), which only runs on
  // rollover, so idle aggregates decay here rather than there.
  const liveFloor = Math.floor(nowMs / BUCKET_MS) - WINDOW_BUCKETS;
  const aggOut = {} as Record<SpanKind, Aggregate[]>;
  const slowOut = {} as Record<SpanKind, SlowSpan[]>;
  for (const kind of KINDS) {
    aggOut[kind] = Array.from(aggregates[kind].values())
      .map((agg) => {
        let recentMaxMs = 0;
        for (const bucket of agg.recentBuckets) {
          if (bucket.at > liveFloor && bucket.max > recentMaxMs) recentMaxMs = bucket.max;
        }
        return {
          label: agg.label,
          count: agg.count,
          totalMs: agg.totalMs,
          maxMs: agg.maxMs,
          lastMs: agg.lastMs,
          waitTotalMs: agg.waitTotalMs,
          childTotalMs: agg.childTotalMs,
          selfTotalMs: agg.selfTotalMs,
          recentMaxMs,
          maxAgeMs: nowMs - agg.maxAtMs,
          byParent: Array.from(agg.byParent.values()).sort((a, b) => b.count - a.count),
          waits: agg.waits ? { ...agg.waits } : undefined,
        };
      })
      // Live relevance first: a label spiking NOW outranks one whose since-boot
      // peak is stale (the aged peak stays readable via maxMs + maxAgeMs).
      .sort((a, b) => b.recentMaxMs - a.recentMaxMs);
    // Most-recent-slowest first: sort the slowest-N buffer by duration desc.
    slowOut[kind] = [...slowest[kind]].sort((a, b) => b.durationMs - a.durationMs);
  }
  return { aggregates: aggOut, slowest: slowOut, sinceMs };
}

/**
 * The automatic loader→table read-set index, materialized as a plain object
 * mapping each loader label (resource key) to a sorted list of the tables its
 * loader read since the last profile reset. Consumed by the resource runtime's
 * `_debug` payload (server-only).
 */
export function getReadSetIndex(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [label, tables] of readSetIndex) {
    out[label] = Array.from(tables).sort();
  }
  return out;
}

/**
 * Seed the loader→table read-set index from a persisted snapshot of it (the
 * durable `tables_read` column on `live_state_snapshot`). Each `seed[key]`'s
 * tables are UNIONED into `readSetIndex[key]` — append-only, identical to how a
 * live loader's captured tables merge in `recordEntrySpan`'s finally; it never
 * clears. Called once at boot (before the readiness barrier) so the in-memory
 * table→resource inversion (`getReadSetIndex` / `tableToResources`) is non-empty
 * for the first `applyDbChange` of catch-up, WITHOUT any loader having run.
 */
export function seedReadSetIndex(seed: Record<string, readonly string[]>): void {
  for (const key in seed) {
    const tables = seed[key]!;
    if (tables.length === 0) continue;
    let set = readSetIndex.get(key);
    if (!set) {
      set = new Set();
      readSetIndex.set(key, set);
    }
    for (const table of tables) set.add(table);
  }
}

// Clears every per-aggregate accumulator (the new maxAtMs/recentBuckets/totals
// live on the aggregate objects, so dropping the maps drops them too). Live
// EntryContexts are intentionally untouched: an in-flight entry records into
// the fresh store when it finishes.
export function resetRuntimeProfile(): void {
  for (const kind of KINDS) {
    aggregates[kind].clear();
    slowest[kind].length = 0;
  }
  readSetIndex.clear();
  sinceMs = now();
}

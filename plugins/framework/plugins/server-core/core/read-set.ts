// The runtime-owned loader → table read-set: which tables each resource's loader
// has read, as captured at the DB pool chokepoint. It is ROUTING state — the
// legacy change router (`applyDbChange`) inverts it into table → resource — so it
// lives here, beside the runtime it feeds, and not in the profiler.
//
// When the profiler owned it, routing inherited the profiler's switches:
// `SINGULARITY_PROFILING=0` stopped the capture (`recordReadTables` returned
// early), so nothing routed, and a Debug → Profiling reset wiped it, so nothing
// routed until each loader happened to run again. The capture itself still rides
// the profiler's ambient loader entry — the same context the DB gate reads —
// but its flush lands here, whatever the profiler records: runtime-profiler's
// install wires `installLoaderReadSetSink(recordLoaderReadSet)`.
// See research/2026-09-29-global-scoped-change-routing.md (P0).

// APPEND-ONLY (union): a table once read stays a dependency. That makes it a
// safe over-approximation for live routing — a stale extra edge only
// over-recomputes, never misses — which is why it is never shed on a run that
// happened not to read a table (a data-dependent conditional query would
// otherwise drop a real live dependency). The self-healing counterpart is
// `lastLoaderReadSet`, used only on the persisted seam. See
// research/2026-07-07-global-read-set-self-heal-on-full-recompute.md.
const readSetIndex = new Map<string, Set<string>>();

// Per-loader PER-RUN read-set: the exact tables the MOST RECENT loader run for a
// key read (replaced each run, never unioned) — what the runtime persists after a
// FULL recompute so the durable `tables_read` seed sheds a dependency a code
// change removed. Written only for a run that read ≥1 table, so a run reading
// nothing never replaces a real set with an empty one.
const lastLoaderReadSet = new Map<string, Set<string>>();

// Moves whenever the union index gains or loses a (key, table) edge — the key the
// router memoizes its table → resource inversion on.
let version = 0;

/**
 * Record one completed loader run's tables for `key`: unioned into the index,
 * and replacing the key's per-run capture. The loader-entry flush of the
 * profiler's ambient context calls this (via `installLoaderReadSetSink`).
 */
export function recordLoaderReadSet(
  key: string,
  tables: ReadonlySet<string>,
): void {
  if (tables.size === 0) return;
  recordUnion(key, tables);
  lastLoaderReadSet.set(key, new Set(tables));
}

/** The tables `key`'s loader has ever read (sorted), or `[]`. */
export function readSetOf(key: string): string[] {
  const set = readSetIndex.get(key);
  return set ? [...set].sort() : [];
}

/** The router's memo key: moves on every edge gained, seeded or removed. */
export function readSetVersion(): number {
  return version;
}

/**
 * The whole index as a plain object, each key's tables sorted — every key that
 * ever captured a table, including one a removal emptied (`[]`).
 */
export function getReadSetIndex(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, tables] of readSetIndex) out[key] = [...tables].sort();
  return out;
}

/**
 * The tables the MOST RECENT loader run for `key` read (sorted), or `undefined`
 * if none captured any. Read it synchronously right after awaiting the loader,
 * so the value is that run's own capture and not a concurrent run's.
 */
export function getLastLoaderReadSet(key: string): string[] | undefined {
  const set = lastLoaderReadSet.get(key);
  return set ? [...set].sort() : undefined;
}

/**
 * Seed the index from a persisted snapshot of it (the durable `tables_read`
 * column): each key's tables are UNIONED in, exactly like a loader run. Called
 * once at boot, before the readiness barrier, so catch-up's first change routes
 * without any loader having run.
 */
export function seedReadSetIndex(
  seed: Record<string, readonly string[]>,
): void {
  for (const key in seed) {
    const tables = seed[key]!;
    if (tables.length > 0) recordUnion(key, tables);
  }
}

function recordUnion(key: string, tables: Iterable<string>): void {
  let set = readSetIndex.get(key);
  if (!set) {
    set = new Set();
    readSetIndex.set(key, set);
  }
  const before = set.size;
  for (const table of tables) set.add(table);
  if (set.size !== before) version++;
}

/**
 * Remove `table` from the read-set of every key EXCEPT those in `keepKeys` — the
 * one eviction path of an append-only index, for a table's owner to evict a
 * historical mis-attribution. Safe: dropping a table a resource does not read
 * only removes a spurious recompute trigger. Returns the keys it changed.
 */
export function removeReadSetTable(
  table: string,
  keepKeys: readonly string[],
): string[] {
  const keep = new Set(keepKeys);
  const changed: string[] = [];
  for (const [key, set] of readSetIndex) {
    if (keep.has(key)) continue;
    // Never delete a now-empty set: an empty read-set is meaningful (the key is
    // still listed, with []).
    if (set.delete(table)) changed.push(key);
  }
  if (changed.length > 0) version++;
  return changed;
}

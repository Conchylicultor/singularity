import { getFileSinks } from "@plugins/infra/plugins/file-sink/core";

// The growth-bound registry: the closed set of bounds on unbounded-growth
// ("firehose") sinks — DB tables AND files. Keyed by `SinkKey`, so a table and a
// file may share a bare name without colliding.
//
// A `GrowthBound` is one of exactly three things, and ALL THREE are true by
// construction — that is the whole point of this module:
//   - `ttl`     — recorded by `defineRetention`'s `register()`, so it exists iff
//                 the nightly sweep is actually MOUNTED (see define-retention.ts).
//   - `cascade` — recorded by `markCascadeBounded`, which first VERIFIES the FK
//                 `onDelete: "cascade"` really exists in the drizzle table object
//                 (see assert-cascade.ts). A false cascade claim throws at module
//                 eval — it never reaches this registry.
//   - `rotate`  — a file sink's own `bound`. NOT declared here at all: `append()`
//                 IS the rotation (see ../file-sink), so a registered sink is a
//                 bounded file by construction. `getGrowthBounds` MERGES these in
//                 from `getFileSinks()` rather than routing them through
//                 `declareGrowthBound` — the edge is `retention → file-sink`, one
//                 way, so file-sink stays a leaf the CLI can import without
//                 dragging `db`/`jobs` in through this module.
//
// Why "true, not merely declared" is load-bearing: the ONLY consumer of this set
// today is the deferred undeclared-growth monitor (a separate follow-up task),
// which watches `pg_stat_user_tables` (and the logs dir) and files a report for
// any large sink carrying NO `GrowthBound`. It uses this registry as its
// *silencing* set — a sink listed here is a sink it stays quiet about. If an entry
// could be present without the bound being real (a policy defined but never
// mounted, an FK claimed but absent), the monitor would be silenced on a sink that
// is in fact still growing without bound — the exact failure it exists to catch.
// So every entry here must be earned, not asserted.

/**
 * The three constructors of a real growth bound. There is no "declared but
 * unbounded" state — it cannot be written, so there is nothing to check for.
 */
export type GrowthBound =
  | { kind: "ttl"; ttlDays: number } // a nightly TTL sweep reclaims the rows
  | { kind: "cascade"; owner: string } // an FK onDelete:"cascade" to `owner` does
  | { kind: "rotate"; maxBytes: number; keep: number }; // a file sink rotates at the cap

/**
 * A registry key that namespaces the two sink kinds so a table and a file may
 * share a bare name (`table:foo` vs `file:foo`) without colliding.
 */
export type SinkKey = `table:${string}` | `file:${string}`;

// SinkKey → its bound. Module-level ⇒ process-global; the `table:` half is
// populated as a side effect of the declaring calls at consumer module eval (boot
// import phase). The `file:` half is NOT stored here — it is merged in on read
// from the file-sink registry (see getGrowthBounds).
const growthBounds = new Map<SinkKey, GrowthBound>();

/**
 * Record a verified growth bound for a DB `table`.
 *
 * DESIGN: this keeps its original bare-table-name signature (both call sites —
 * `defineRetention` and `markCascadeBounded` — pass a table name) and stamps the
 * `table:` prefix internally. That reads best: the function's contract ("a DB
 * table is declared exactly once") is unchanged and its two callers stay
 * untouched, while file sinks — which are true by construction and never
 * "declared" — come in through the merge in `getGrowthBounds`, not this path. The
 * `SinkKey` namespacing is an internal detail that only exists so the two sources
 * can coexist in one map.
 *
 * Strictest sane rule: a table is declared EXACTLY ONCE, so ANY re-declaration
 * throws — not just a conflicting one. Two calls naming the same table (even with
 * an identical bound) mean two owners believe they bound the table's growth;
 * that ambiguity is an authoring bug, and silently keeping one entry would hide
 * it. Boot-fatal is the right loudness (see the callers).
 */
export function declareGrowthBound(table: string, bound: GrowthBound): void {
  const key: SinkKey = `table:${table}`;
  const existing = growthBounds.get(key);
  if (existing) {
    throw new Error(
      `[retention] table "${table}" already has a growth bound ` +
        `(${describeBound(existing)}); a table is declared exactly once. ` +
        `Attempted to re-declare it as ${describeBound(bound)}. ` +
        `Remove the duplicate declaration.`,
    );
  }
  growthBounds.set(key, bound);
}

/**
 * The full, true set of growth bounds: the declared DB-table bounds MERGED with
 * every registered file sink's own `rotate` bound (`file:${id}`). A fresh map per
 * call — callers never hold the live registry, and the file half is recomputed
 * from `getFileSinks()` each read (so a sink registered after boot is included).
 */
export function getGrowthBounds(): ReadonlyMap<SinkKey, GrowthBound> {
  const merged = new Map<SinkKey, GrowthBound>(growthBounds);
  for (const sink of getFileSinks().values()) {
    merged.set(`file:${sink.id}`, sink.bound);
  }
  return merged;
}

function describeBound(bound: GrowthBound): string {
  switch (bound.kind) {
    case "ttl":
      return `ttl ${bound.ttlDays}d`;
    case "cascade":
      return `cascade → ${bound.owner}`;
    case "rotate":
      return `rotate ${bound.maxBytes}B × ${bound.keep}`;
  }
}

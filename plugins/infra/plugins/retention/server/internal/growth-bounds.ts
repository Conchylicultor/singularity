// The growth-bound registry: the closed set of DECLARED bounds on
// unbounded-growth ("firehose") DB tables, keyed by table name.
//
// A `GrowthBound` is one of exactly two things, and BOTH are true by
// construction — that is the whole point of this module:
//   - `ttl`     — recorded by `defineRetention`'s `register()`, so it exists iff
//                 the nightly sweep is actually MOUNTED (see define-retention.ts).
//   - `cascade` — recorded by `markCascadeBounded`, which first VERIFIES the FK
//                 `onDelete: "cascade"` really exists in the drizzle table object
//                 (see assert-cascade.ts). A false cascade claim throws at module
//                 eval — it never reaches this registry.
//
// Why "true, not merely declared" is load-bearing: the ONLY consumer of this set
// today is the deferred undeclared-growth monitor (a separate follow-up task),
// which watches `pg_stat_user_tables` and files a report for any large table
// carrying NO `GrowthBound`. It uses this registry as its *silencing* set — a
// table listed here is a table it stays quiet about. If an entry could be present
// without the bound being real (a policy defined but never mounted, an FK claimed
// but absent), the monitor would be silenced on a table that is in fact still
// growing without bound — the exact failure it exists to catch. So every entry
// here must be earned, not asserted.

/**
 * The two constructors of a real growth bound. There is no "declared but
 * unbounded" state — it cannot be written, so there is nothing to check for.
 */
export type GrowthBound =
  | { kind: "ttl"; ttlDays: number } // a nightly TTL sweep reclaims the rows
  | { kind: "cascade"; owner: string }; // an FK onDelete:"cascade" to `owner` does

// table name → its bound. Module-level ⇒ process-global; populated as a side
// effect of the declaring calls at consumer module eval (i.e. boot import phase).
const growthBounds = new Map<string, GrowthBound>();

/**
 * Record a verified growth bound for `table`.
 *
 * Strictest sane rule: a table is declared EXACTLY ONCE, so ANY re-declaration
 * throws — not just a conflicting one. Two calls naming the same table (even with
 * an identical bound) mean two owners believe they bound the table's growth;
 * that ambiguity is an authoring bug, and silently keeping one entry would hide
 * it. Boot-fatal is the right loudness (see the callers).
 */
export function declareGrowthBound(table: string, bound: GrowthBound): void {
  const existing = growthBounds.get(table);
  if (existing) {
    throw new Error(
      `[retention] table "${table}" already has a growth bound ` +
        `(${describeBound(existing)}); a table is declared exactly once. ` +
        `Attempted to re-declare it as ${describeBound(bound)}. ` +
        `Remove the duplicate declaration.`,
    );
  }
  growthBounds.set(table, bound);
}

/** A copy of the registry — callers never hold the live map. */
export function getGrowthBounds(): ReadonlyMap<string, GrowthBound> {
  return new Map(growthBounds);
}

function describeBound(bound: GrowthBound): string {
  return bound.kind === "ttl"
    ? `ttl ${bound.ttlDays}d`
    : `cascade → ${bound.owner}`;
}

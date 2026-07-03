// Boot-time invariant: no keyed live-state resource may scope its `identityTable`
// to a table that has been excluded from the change-feed (ExcludeFromChangeFeed).
//
// WHY this is a bug, not a warning. A scoped resource earns single-row keyed
// deltas by declaring `identityTable: <base table>`; the runtime delivers a scoped
// update only when a feed change arrives with `origin === identityTable`. But an
// excluded table installs NO trigger (see ./exclusion) — it never fires pg_notify,
// never appends a changelog row, never drives a recompute. So the scoped path can
// never match: the resource silently degrades to hydrate-on-mount while its
// declaration positively claims live scoping. Nothing else in the system reveals
// the mismatch — the read-set ceiling pane shows the resource as fully covered,
// because coverage is computed from the (declared) identityTable, not from whether
// a trigger actually exists. This is the exact "dead scope policy" the A1
// query-resource sweep flagged for reports/slow_ops (both correctly non-keyed
// today) and is unguarded for any future keyed resource — hand-written or
// query-resource-compiled — that names an excluded table.
//
// This is the sibling of `warnOnCoverageGaps` (triggers.ts): both reconcile the
// change-feed against its consumers at boot because a static `./singularity check`
// can reach neither a live DB nor the server-only contribution/registry sets. This
// one THROWS (blocks boot) rather than warning, because a scoped resource on an
// excluded table is always a definite bug with a clear fix, never transient drift.

export interface ScopedResourceIdentity {
  /** The resource key (for the diagnostic). */
  key: string;
  /** The base table this resource declared as its scoped identity. */
  identityTable: string;
}

/**
 * The scoped resources whose `identityTable` is in the change-feed exclusion set —
 * i.e. those whose declared scoped delivery can never fire. Pure; the boot hook
 * feeds it `scopedResourceIdentities()` and `excludedTableNames()`.
 */
export function findDeadScopePolicies(
  scoped: readonly ScopedResourceIdentity[],
  excludedTables: ReadonlySet<string>,
): ScopedResourceIdentity[] {
  return scoped.filter((r) => excludedTables.has(r.identityTable));
}

/** Loud, actionable message enumerating every dead scope policy. */
export function formatDeadScopeError(
  violations: readonly ScopedResourceIdentity[],
): string {
  const lines = violations
    .map((v) => `  • ${v.key}  →  identityTable "${v.identityTable}"`)
    .sort();
  return [
    `[change-feed] Dead scope policy: ${violations.length} keyed live-state ` +
      `resource(s) scope their identityTable to a table excluded from the ` +
      `change-feed (ExcludeFromChangeFeed). An excluded table installs no ` +
      `trigger, so the scoped delivery these resources declare can NEVER fire — ` +
      `they silently degrade to hydrate-on-mount while claiming live scoping:`,
    "",
    ...lines,
    "",
    "Fix one of:",
    "  - If the resource must stay live-scoped: remove the table's " +
      "ExcludeFromChangeFeed contribution (accept its feed churn).",
    "  - If the table must stay excluded: make the resource a plain push " +
      "resource (hydrate-on-mount, no identityTable), matching reports/slow_ops.",
  ].join("\n");
}

/**
 * Throw loudly (blocking boot) if any scoped resource names an excluded table.
 * Called from the change-feed `onReadyBlocking` after triggers are rebuilt.
 */
export function assertNoDeadScopePolicies(
  scoped: readonly ScopedResourceIdentity[],
  excludedTables: ReadonlySet<string>,
): void {
  const dead = findDeadScopePolicies(scoped, excludedTables);
  if (dead.length > 0) {
    throw new Error(formatDeadScopeError(dead));
  }
}

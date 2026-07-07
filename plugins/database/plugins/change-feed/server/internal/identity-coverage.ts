// Boot-time invariant: every keyed live-state resource must scope its
// `identityTable` to a table the change-feed ACTUALLY installs a trigger on.
//
// WHY this is a bug, not a warning. A scoped resource earns single-row keyed
// deltas by declaring `identityTable: <base table>`; the runtime delivers a scoped
// update only when a feed change arrives with `origin === identityTable`. That
// origin can only ever be a table the change-feed put a trigger on (see
// ./triggers `coveredTables`). If the named table has NO trigger — because it was
// excluded (ExcludeFromChangeFeed), is a feed-exempt derived-table rollup, is a
// VIEW name instead of its base table (the documented footgun in
// resource-runtime), or is a typo / dropped table — it never fires pg_notify,
// never appends a changelog row, never drives a recompute. So the scoped path can
// never match: the resource silently degrades to hydrate-on-mount while its
// declaration positively claims live scoping. Nothing else in the system reveals
// the mismatch — the read-set ceiling pane shows the resource as fully covered,
// because coverage is computed from the (declared) identityTable, not from whether
// a trigger actually exists.
//
// This generalizes the original exclusion-only check: the single authoritative
// question is "is `identityTable` in the set of tables we installed triggers on?"
// — which subsumes the ExcludeFromChangeFeed case AND catches the typo / view /
// rollup / nonexistent variants of the exact same dead-scope failure mode. We
// still classify each violation by WHY it is uncovered, because the remediations
// differ (an excluded table can have its exclusion dropped; a rollup must be keyed
// off its source; a typo/view is just a wrong string).
//
// This is the sibling of `warnOnCoverageGaps` (triggers.ts): both reconcile the
// change-feed against its consumers at boot because a static `./singularity check`
// can reach neither a live DB nor the server-only contribution/registry sets. This
// one THROWS (blocks boot) rather than warning, because a scoped resource on an
// untriggered table is always a definite bug with a clear fix, never transient
// drift — the covered-tables set is exactly what `rebuildTriggers` just installed,
// so any real base table a resource legitimately scopes to is present by
// construction, and a miss is never a false positive.

export interface ScopedResourceIdentity {
  /** The resource key (for the diagnostic). */
  key: string;
  /** The base table this resource declared as its scoped identity. */
  identityTable: string;
}

// Why a scoped resource's identityTable is not in the triggered set — drives the
// per-violation remediation. Ordered from most-specific (a deliberate opt-out) to
// least (a wrong string).
export type ScopeViolationReason =
  // Table opted out of the feed via `ExcludeFromChangeFeed`.
  | "excluded"
  // Table is a derived-table rollup — feed-exempt by design (a read-cache of its
  // source, never independently triggered).
  | "rollup"
  // No trigger for any known reason: a typo, a VIEW name (identityTable must be
  // the BASE table), or a dropped / nonexistent table.
  | "uncovered";

export interface ScopePolicyViolation extends ScopedResourceIdentity {
  reason: ScopeViolationReason;
}

/**
 * Classify why a scoped resource's identityTable is not triggered. Only called
 * for tables already known to be absent from `coveredTables`.
 */
function classify(
  identityTable: string,
  excludedTables: ReadonlySet<string>,
  exemptTables: ReadonlySet<string>,
): ScopeViolationReason {
  if (excludedTables.has(identityTable)) return "excluded";
  if (exemptTables.has(identityTable)) return "rollup";
  return "uncovered";
}

/**
 * The scoped resources whose `identityTable` is NOT in the set of tables the
 * change-feed installed a trigger on — i.e. those whose declared scoped delivery
 * can never fire. Pure; the boot hook feeds it `scopedResourceIdentities()`,
 * `getCoveredTables()`, `excludedTableNames()`, and `feedExemptTables()`. The
 * exclusion / exempt sets are used only to classify the reason (for remediation),
 * never to decide membership — coverage is the single source of truth.
 */
export function findUncoveredScopePolicies(
  scoped: readonly ScopedResourceIdentity[],
  coveredTables: ReadonlySet<string>,
  excludedTables: ReadonlySet<string>,
  exemptTables: ReadonlySet<string>,
): ScopePolicyViolation[] {
  return scoped
    .filter((r) => !coveredTables.has(r.identityTable))
    .map((r) => ({
      ...r,
      reason: classify(r.identityTable, excludedTables, exemptTables),
    }));
}

// The remediation copy for each reason. `[0]` is the specific first-choice fix;
// every case shares the universal fallback (make the resource a plain push
// resource with no identityTable, matching reports/slow_ops).
const REASON_SECTIONS: Record<
  ScopeViolationReason,
  { heading: string; fix: string }
> = {
  excluded: {
    heading: "Excluded from the change-feed (ExcludeFromChangeFeed) — no trigger:",
    fix: "remove the table's ExcludeFromChangeFeed contribution (accept its feed churn)",
  },
  rollup: {
    heading:
      "Derived-table rollup — feed-exempt by design (a read-cache of its source, never triggered):",
    fix: "key the resource off the rollup's SOURCE table instead (the change flows from there)",
  },
  uncovered: {
    heading:
      "No trigger installed — a typo, a VIEW name (identityTable must be the BASE table, not the view), or a dropped/nonexistent table:",
    fix: "correct the identityTable to a real triggered base table",
  },
};

const REASON_ORDER: readonly ScopeViolationReason[] = [
  "excluded",
  "rollup",
  "uncovered",
];

/** Loud, actionable message grouping every dead scope policy by its reason. */
export function formatUncoveredScopeError(
  violations: readonly ScopePolicyViolation[],
): string {
  const sections: string[] = [];
  for (const reason of REASON_ORDER) {
    const group = violations
      .filter((v) => v.reason === reason)
      .map((v) => `  • ${v.key}  →  identityTable "${v.identityTable}"`)
      .sort();
    if (group.length === 0) continue;
    const { heading, fix } = REASON_SECTIONS[reason];
    sections.push(
      "",
      heading,
      ...group,
      `  Fix: ${fix}, or make the resource a plain push resource (no identityTable, hydrate-on-mount — like reports/slow_ops).`,
    );
  }
  return [
    `[change-feed] Dead scope policy: ${violations.length} keyed live-state ` +
      `resource(s) declare an identityTable the change-feed installs no trigger ` +
      `on. Scoped delivery fires only on origin === identityTable, which an ` +
      `untriggered table can NEVER produce — so these resources silently degrade ` +
      `to hydrate-on-mount while claiming live scoping:`,
    ...sections,
  ].join("\n");
}

/**
 * Throw loudly (blocking boot) if any scoped resource names a table the
 * change-feed did not install a trigger on. Called from the change-feed
 * `onReadyBlocking` after `rebuildTriggers` has populated the covered set.
 */
export function assertScopePoliciesCovered(
  scoped: readonly ScopedResourceIdentity[],
  coveredTables: ReadonlySet<string>,
  excludedTables: ReadonlySet<string>,
  exemptTables: ReadonlySet<string>,
): void {
  const dead = findUncoveredScopePolicies(
    scoped,
    coveredTables,
    excludedTables,
    exemptTables,
  );
  if (dead.length > 0) {
    throw new Error(formatUncoveredScopeError(dead));
  }
}

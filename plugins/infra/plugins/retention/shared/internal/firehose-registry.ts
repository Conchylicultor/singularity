// Module-level registry of DECLARED-firehose tables and the tables covered by a
// retention policy. Populated as a side effect of `defineRetention` /
// `markFirehose` at call time (module eval of the consumer), so importing a
// consumer module that declares a firehose table registers it here. The
// `retention:firehose-bounded` check reads this to fail when a firehose table
// has no bound.
//
// Deliberately string-keyed (table NAMES, not drizzle table objects): the check
// runs in a standalone process and only ever holds names. FK-cascade coverage is
// therefore a DECLARED flag (`markFirehose(table, { cascadeOwner: true })`), never
// auto-detected from a drizzle table object the check does not have.

export interface FirehoseEntry {
  /** Postgres table name (from drizzle `getTableName`). */
  table: string;
  /**
   * The table's unbounded growth is bounded by an FK `onDelete: "cascade"` to an
   * owner row (deleting the owner reclaims the children), not by a TTL sweep.
   * Declared, not introspected — see the module header.
   */
  cascadeOwner: boolean;
}

// table name → entry. A Map dedupes by name; a re-declaration wins last (a table
// declared both firehose and cascade-owner keeps whichever call ran last, which
// is a consumer authoring bug that surfaces loudly enough via the check).
const firehoseTables = new Map<string, FirehoseEntry>();
// Every table that has a `defineRetention` policy naming it (regardless of the
// firehose flag) — the coverage set the check joins against.
const retentionCoveredTables = new Set<string>();

/** Record that `table` is a declared firehose (called by defineRetention/markFirehose). */
export function declareFirehose(table: string, opts: { cascadeOwner: boolean }): void {
  firehoseTables.set(table, { table, cascadeOwner: opts.cascadeOwner });
}

/** Record that `table` has a retention policy (called by every defineRetention). */
export function declareRetentionCoverage(table: string): void {
  retentionCoveredTables.add(table);
}

export function getFirehoseEntries(): FirehoseEntry[] {
  return [...firehoseTables.values()];
}

export function getRetentionCoveredTables(): Set<string> {
  return new Set(retentionCoveredTables);
}

export type FirehoseCoverageResult =
  | { ok: true }
  | { ok: false; uncovered: string[] };

/**
 * Pure coverage evaluator (no module state read) — the check body and the tests
 * both call this. A firehose table is bounded iff it has a retention policy
 * naming it OR it is declared cascade-owner. An empty firehose set is trivially
 * bounded.
 */
export function evaluateFirehoseCoverage(
  entries: FirehoseEntry[],
  retentionCovered: Set<string>,
): FirehoseCoverageResult {
  const uncovered = entries
    .filter((e) => !e.cascadeOwner && !retentionCovered.has(e.table))
    .map((e) => e.table)
    .sort();
  return uncovered.length === 0 ? { ok: true } : { ok: false, uncovered };
}

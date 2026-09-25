import { liveOps, type LiveScalar } from "./ops";
import type { LiveClause } from "./query";

/** One clause's answer for one value — the in-memory twin of the server's clause SQL. */
export function testLiveClause(
  value: LiveScalar | null,
  clause: LiveClause,
): boolean {
  // One correlated-union cast: `clause.op` and `clause.operand` are paired by
  // the `LiveClause` union, which TS cannot narrow through the table lookup.
  const test = liveOps[clause.op].test as (
    v: LiveScalar | null,
    operand: LiveClause["operand"],
  ) => boolean;
  return test(value, clause.operand);
}

/**
 * Does `row` pass every clause (AND)? A row field that is absent (not `null`)
 * throws: the declaration promised the column, and reading `undefined` as NULL
 * would silently answer `isNull: true`.
 */
export function matchesLiveWhere(
  row: Readonly<Record<string, unknown>>,
  where: readonly LiveClause[],
): boolean {
  return where.every((clause) => {
    const value = row[clause.column];
    if (value === undefined) {
      throw new Error(
        `matchesLiveWhere: row has no "${clause.column}" field to filter on`,
      );
    }
    return testLiveClause(value as LiveScalar | null, clause);
  });
}

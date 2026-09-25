import { sql, type SQL } from "drizzle-orm";
import type {
  LiveClause,
  LiveOperands,
  LiveOpId,
  LiveScalar,
} from "@plugins/network/plugins/live/core";

// The SQL half of the op table — keyed by core's `LiveOpId`, so a missing or
// extra op is a tsc error. `target` is a rendered SQL expression, never the
// drizzle column: an operand is not a stored value, and a column would run its
// WRITE-side encoder over it (the same rule as server-query's
// `comparisonTarget`). Lists bind as ONE array param (`sql.param`), because a
// bare array inside a `sql` template expands to a `($1, $2, …)` tuple.
//
// NULL agrees with core's `test`: `=` / `<>` / `<` … are NULL (row excluded)
// for a NULL target; `notIn` spells its `IS NOT NULL` explicitly, because
// `NULL <> ALL('{}')` is TRUE in Postgres.

type OpSql = {
  [K in LiveOpId]: (target: SQL, operand: LiveOperands<LiveScalar>[K]) => SQL;
};

export const liveOpSql: OpSql = {
  eq: (t, x) => sql`${t} = ${x}`,
  ne: (t, x) => sql`${t} <> ${x}`,
  gt: (t, x) => sql`${t} > ${x}`,
  gte: (t, x) => sql`${t} >= ${x}`,
  lt: (t, x) => sql`${t} < ${x}`,
  lte: (t, x) => sql`${t} <= ${x}`,
  in: (t, xs) => sql`${t} = ANY(${sql.param([...xs])})`,
  notIn: (t, xs) =>
    sql`(${t} IS NOT NULL AND ${t} <> ALL(${sql.param([...xs])}))`,
  isNull: (t, isNull) => (isNull ? sql`${t} IS NULL` : sql`${t} IS NOT NULL`),
};

/** One decoded clause as a SQL predicate over `target` (the clause column, rendered). */
export function liveClauseSql(target: SQL, clause: LiveClause): SQL {
  // One correlated-union cast: `op` and `operand` are paired by `LiveClause`.
  const build = liveOpSql[clause.op] as (
    target: SQL,
    operand: LiveClause["operand"],
  ) => SQL;
  return build(target, clause.operand);
}

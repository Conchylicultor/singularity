import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  executeRows,
  type SqlExecutable,
} from "@plugins/database/plugins/sql-rows/core";
import type { EvaluatedRow, EvaluateCtx, MetricEvaluate } from "../../core";

// SQL-backed metrics in a few lines. Both helpers join the table against the
// ENGINE's own intervals (`unnest($starts, $ends) WITH ORDINALITY`) instead of
// re-deriving boundaries with date_trunc, so a day boundary exists once, in
// `core/intervals`, and the same query evaluates every bucket, the range and
// the previous range — which is what keeps a distinct count or a median right
// over the whole range.

/** A value that may depend on the query's parsed params. */
type ByParams<P, T> = T | ((params: P) => T);

export interface SqlSplit {
  /** The split key, cast to text; NULL reads as "(none)". */
  expr: SQL;
  /** Display label; defaults to the key. */
  label?: SQL;
}

interface SqlCommon<P> {
  db: SqlExecutable<SQL>;
  /** A table (or subquery) with its alias, e.g. sql`tasks_v t`. */
  from: SQL;
  where?: ByParams<P, SQL | undefined>;
  /** One SQL expression per split id the metric declares. */
  splits?: Readonly<Record<string, SqlSplit>>;
}

export interface SqlFlowSpec<P> extends SqlCommon<P> {
  /** The instant a row counts at: it lands in the interval containing it. */
  time: SQL;
  /** The aggregate over an interval's rows, e.g. sql`count(*)`, sql`count(distinct t.author)`. */
  agg: SQL;
  /**
   * The value of an interval no row falls in: 0 for a count or a sum; null for
   * a median or a ratio, which has no value over nothing (drawn as a gap).
   */
  empty?: 0 | null;
}

export interface SqlLevelSpec<P> extends SqlCommon<P> {
  /** When a row opens. */
  start: SQL;
  /** When it closes; NULL = still open. */
  end: SQL;
}

/** Aggregate rows by the interval their `time` falls in. */
export function sqlFlow<P>(spec: SqlFlowSpec<P>): MetricEvaluate<P> {
  return (ctx) =>
    run(spec, ctx, {
      on: sql`${spec.time} >= iv.s AND ${spec.time} < iv.e`,
      agg: spec.agg,
      // Not `??`: an explicit null is the answer, not a missing one.
      empty: spec.empty === undefined ? 0 : spec.empty,
    });
}

/** Count the rows open at each interval's end: opened before it, not closed before it. */
export function sqlLevel<P>(spec: SqlLevelSpec<P>): MetricEvaluate<P> {
  return (ctx) =>
    run(spec, ctx, {
      on: sql`${spec.start} < iv.e AND (${spec.end} IS NULL OR ${spec.end} >= iv.e)`,
      agg: sql`count(*)`,
      empty: 0,
    });
}

const CellSchema = z.object({
  i: z.number().int(),
  key: z.string(),
  label: z.string(),
  value: z.number().nullable(),
});

const UNSPLIT = { key: "total", label: "Total" } as const;
const NO_KEY = "(none)";

async function run<P>(
  spec: SqlCommon<P>,
  ctx: EvaluateCtx<P>,
  shape: { on: SQL; agg: SQL; empty: 0 | null },
): Promise<EvaluatedRow[]> {
  const split = ctx.split === null ? null : spec.splits?.[ctx.split];
  if (split === undefined) {
    throw new Error(
      `sqlFlow/sqlLevel: no SQL expression for split "${ctx.split}"`,
    );
  }
  const where =
    typeof spec.where === "function" ? spec.where(ctx.params) : spec.where;

  const key =
    split === null
      ? sql`${UNSPLIT.key}::text`
      : sql`coalesce((${split.expr})::text, ${NO_KEY}::text)`;
  const label =
    split === null
      ? sql`${UNSPLIT.label}::text`
      : split.label === undefined
        ? sql`min(${key})`
        : sql`min(coalesce((${split.label})::text, ${key}))`;

  const starts = ctx.intervals.map((iv) => iv.start);
  const ends = ctx.intervals.map((iv) => iv.end);
  // GROUP BY output positions: the key expression carries a bound parameter,
  // and Postgres never matches two spellings of one parameterised expression.
  const cells = await executeRows(spec.db, {
    label: "metrics.sql",
    row: CellSchema,
    query: sql`
      SELECT (iv.i - 1)::int AS i, ${key} AS key, ${label} AS label, (${shape.agg})::float8 AS value
      FROM unnest(${sql.param(starts)}::timestamptz[], ${sql.param(ends)}::timestamptz[])
        WITH ORDINALITY AS iv(s, e, i)
      JOIN ${spec.from} ON ${shape.on}${where === undefined ? sql`` : sql` AND (${where})`}
      GROUP BY 1, 2`,
  });

  // Every interval is listed up front, so a missing cell is an interval no row
  // fell in — its empty value — never an unknown one.
  const n = ctx.intervals.length;
  const rows = new Map<string, EvaluatedRow>();
  if (split === null) {
    rows.set(UNSPLIT.key, {
      ...UNSPLIT,
      values: Array<number | null>(n).fill(shape.empty),
    });
  }
  for (const cell of cells) {
    let row = rows.get(cell.key);
    if (row === undefined) {
      row = {
        key: cell.key,
        label: cell.label,
        values: Array<number | null>(n).fill(shape.empty),
      };
      rows.set(cell.key, row);
    }
    row.values[cell.i] = cell.value;
  }
  return [...rows.values()];
}

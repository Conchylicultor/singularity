import { count, getTableName, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db as realDb } from "@plugins/database/server";
import type {
  FullRoute,
  ReachPlan,
  ResourceParams,
  ServerResourceOptions,
  TupleUse,
} from "@plugins/framework/plugins/resource-runtime/core";
import {
  BASE_RELATION,
  type JoinSpec,
} from "@plugins/infra/plugins/query-resource/core";
import { compileJoins, routeColumnsOf } from "./joins";
import { BASE_ROUTE_ID, compiledReachPlan, routedBase } from "./routes";
import type { QueryDb, QueryStep, RoutedSource } from "./spec";

// The grouping compiler — a collection's `:groups` sibling (network/live's
// `serveCollection`): one push value per grouping tuple,
//
//   SELECT col AS value, count(*) AS count FROM <table> WHERE <where>
//   GROUP BY col ORDER BY count(*) DESC, col ASC NULLS LAST LIMIT n
//
// ROUTED like the window and point siblings it serves beside, through the
// non-keyed `reach` arm: one `full` route on the base table and one per
// declared join (`./routes`, `./joins`), so a write to a table a grouping reads
// recomputes it and a write to any other table reaches none — without
// depending on a captured read-set. A grouping reads a join only when its
// grouped column or its `where` references it (or it is a required lookup): a
// 1:1 LEFT join that nothing references changes no count, so it is not joined,
// and its writes reach none of those tuples. Rendered here, beside the window
// compiler, so the relations its SQL reads and the ones its routes name come
// from one declaration.

// Every table a grouping reads can move its counts, so every use is membership.
const MEMBERSHIP: TupleUse = { role: "membership" };

/** One tuple's grouping, decoded from its params by the caller. */
export interface GroupsQuery {
  /** The column whose values are grouped: a base column, or a join's rendered one (see `ReadColumn`). */
  column: PgColumn | SQL;
  /** The collection's base membership ∧ the tuple's filter; `undefined` = none. */
  where: SQL | undefined;
  /** At most this many groups. */
  limit: number;
  /**
   * Called with every non-NULL group value; throws on a value the caller's row
   * type cannot hold (a stored value outside the schema), so it fails loudly
   * instead of reaching the wire.
   */
  check: (value: unknown) => void;
}

export interface GroupsQuerySpec<P extends ResourceParams> {
  /** The table to read — never a view (see `RoutedSource`). */
  from: RoutedSource;
  /** The per-tuple grouping query. */
  query: (params: P) => GroupsQuery;
  /** The relations joined onto `from` (see `JoinSpec`), each joined only by the tuples that read it. */
  joins?: readonly JoinSpec[];
  /** The host's identity column — what a `keyed-side` join matches. */
  hostPk?: PgColumn;
  /**
   * Every column a grouping's `column` / `where` may read — rendered columns,
   * or fragments standing for them (a static predicate) — the universe its
   * routes' `columns` are cut from; a tuple reading outside it throws. Absent,
   * every column of every relation is a route column.
   */
  reads?: readonly (PgColumn | SQL)[];
  /** Test seam. Defaults to the real per-worktree drizzle `db`. */
  db?: QueryDb;
}

/** The compiled `:groups` server half — the two-arg `defineResource` opts. */
export type CompiledGroups<
  Row,
  P extends ResourceParams,
> = ServerResourceOptions<Row[], P> & { mode: "push"; reach: ReachPlan<P> };

/**
 * Compile a grouping spec into push `defineResource` opts carrying its `reach`
 * plan. `Row` is the caller's group row (`{ value, count }`), stated once at the
 * select. Misuse (a view `from`) throws here, at module eval.
 */
export function compileGroupsQuery<
  Row extends { value: unknown; count: number },
  P extends ResourceParams,
>(key: string, spec: GroupsQuerySpec<P>): CompiledGroups<Row, P> {
  const label = `groupsQuery("${key}")`;
  const base = routedBase(spec.from, label);
  // One boundary cast — the `compileWindowQuery` precedent.
  const db: QueryDb = spec.db ?? (realDb as unknown as QueryDb);
  const joins = compileJoins(base, spec.joins ?? [], spec.hostPk, label);
  const open = spec.reads === undefined;
  const columnsOf = routeColumnsOf(
    joins,
    base,
    joins.columnsIn(spec.reads ?? []),
    open,
  );
  const reason = (relation: string): string =>
    relation === BASE_RELATION
      ? "a grouping counts every row its filter matches — any written row may move a count"
      : `a grouping over join "${relation}" — any written row of it may move a count`;
  const routes: FullRoute[] = [
    {
      id: BASE_ROUTE_ID,
      table: base.name,
      map: { kind: "full", reason: reason(BASE_RELATION) },
      columns: columnsOf(BASE_RELATION),
    },
    ...joins.joins.map((j): FullRoute => ({
      id: j.alias,
      table: getTableName(j.spec.table),
      map: { kind: "full", reason: reason(j.alias) },
      columns: columnsOf(j.alias),
      // A keyed side reads only its selectors' rows: a write to another
      // scope's or member's rows moves no count.
      ...(j.spec.kind === "keyed-side"
        ? {
            rows: Object.fromEntries(
              j.spec.selectors.map((sel) => [sel.col.name, sel.value]),
            ),
          }
        : {}),
    })),
  ];

  // One tuple's grouping and the joins its SQL reads: the grouped column's and
  // the `where`'s relations, the required lookups, and what they hang off.
  const tuple = (params: P) => {
    const q = spec.query(params);
    const read = joins.columnsIn([q.column, q.where]);
    if (!open) {
      for (const [relation, column] of read) {
        if (!columnsOf(relation).includes(column)) {
          throw new Error(
            `${label}: the grouping reads "${relation}"."${column}", which is not in \`reads\` — the route columns would miss it. Declare it there.`,
          );
        }
      }
    }
    const included = joins.closure([
      ...joins.required,
      ...read.map(([relation]) => relation),
    ]);
    const uses = new Map<string, TupleUse>([[BASE_RELATION, MEMBERSHIP]]);
    for (const alias of included) uses.set(alias, MEMBERSHIP);
    return { q, included, uses };
  };

  // NULL is its own group (sorted last among equal counts); the cluster's `C`
  // collation makes the value tiebreak code-point order, matching the filter
  // language's `compareScalars`.
  const loader = async (params: P): Promise<Row[]> => {
    const { q, included } = tuple(params);
    let query: QueryStep<Row> = joins.apply(
      db
        .select<Row>({ value: q.column, count: count().as("count") })
        .from(base.table),
      included,
    );
    if (q.where) query = query.where(q.where);
    const rows = await query
      .groupBy(q.column)
      .orderBy(sql`count(*) DESC`, sql`${q.column} ASC NULLS LAST`)
      .limit(q.limit);
    for (const row of rows) if (row.value !== null) q.check(row.value);
    return rows;
  };

  return {
    mode: "push",
    loader,
    reach: compiledReachPlan<P>(routes, (params) => tuple(params).uses),
  };
}

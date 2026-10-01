import { getTableColumns, is } from "drizzle-orm";
import {
  PgTable,
  PgView,
  getTableConfig,
  type PgColumn,
} from "drizzle-orm/pg-core";
import {
  mintReachPlan,
  mintRoutePlan,
  type FullRoute,
  type ReachPlan,
  type ResourceParams,
  type Route,
  type RoutePlan,
  type TupleUse,
} from "@plugins/framework/plugins/resource-runtime/core";
import { BASE_RELATION } from "@plugins/infra/plugins/query-resource/core";
import type { EntitySource, QuerySource } from "./spec";

// The routed half of a compiled read: the `RoutePlan` (or, for a non-keyed
// aggregate, the `ReachPlan`) the runtime's `routeTableChange` serves the
// resource by — see research/2026-09-29-global-scoped-change-routing.md. Emitted
// from the same declaration the SQL is rendered from, so the tables a query
// reads and the tables its routes name cannot disagree (the runtime's drift
// guard, A8, checks the captured read-set against them all the same).
//
// A compiled read is its base table (route `base`, an `identity` route every
// tuple reads as membership) plus its declared joins (one route each, named by
// the join's alias — `./joins`), and a tuple's `usesOf` names exactly the
// relations its SQL joins.
//
// This module is the one production minter of plans (`mintRoutePlan` /
// `mintReachPlan` — the `resource-runtime:compiled-routes` check): a route's
// `columns` gate which updates reach the resource, so only the code that writes
// the SQL may state them.

/** The base table's route id — its `ColumnRef` relation name too. */
export const BASE_ROUTE_ID = BASE_RELATION;

/** The base table a routed compile reads — never a view (A1). */
export interface RoutedBase {
  table: PgTable;
  /** The table's name: the only name a change to it ever arrives under. */
  name: string;
}

/**
 * The base table of a routed compile, or a loud throw for a view. A view has no
 * trigger — a change arrives under its base tables' names, which a view
 * declaration cannot state as routes — so a routed resource reads tables (A1).
 */
export function routedBase(from: QuerySource, label: string): RoutedBase {
  if (is(from, PgView)) {
    throw new Error(
      `${label}: a routed compile reads a base table, never a view — a change ` +
        `arrives under its base tables' names, which no route of a view can ` +
        `state. Read the base table (an entity, or the pgTable itself).`,
    );
  }
  const table = is(from, PgTable) ? from : (from as EntitySource).table;
  return { table, name: getTableConfig(table).name };
}

/**
 * The table's single-column primary key — inline (`.primaryKey()`) or declared
 * table-level (`primaryKey({ columns })`) — or null (composite / none): the one
 * key the change feed sends as `ids`.
 */
export function tablePrimary(table: PgTable): PgColumn | null {
  const columns = Object.values(
    getTableColumns(table) as Record<string, PgColumn>,
  );
  const declared = getTableConfig(table).primaryKeys;
  if (declared.length > 0) {
    const only = declared.length === 1 ? declared[0]!.columns : [];
    // The declaration's columns are built apart from the table's own column
    // objects: resolve the name back to the table's.
    return only.length === 1
      ? (columns.find((c) => c.name === only[0]!.name) ?? null)
      : null;
  }
  const primaries = columns.filter((c) => c.primary);
  return primaries.length === 1 ? primaries[0]! : null;
}

/**
 * The base table's route in a keyed read whose host ids are the values of
 * `pk`: an `identity` route. When `pk` IS the table's primary key the change
 * feed's ids are the host ids as they stand; otherwise the route reads `pk` off
 * the change's key layout, and a change that carries none recomputes its readers
 * FULL (correct, not scoped). Every tuple reads it as membership: a row write
 * may move it in or out.
 */
export function baseIdentityRoute(
  base: RoutedBase,
  pk: PgColumn,
  columns: readonly string[],
): Route {
  return {
    id: BASE_ROUTE_ID,
    table: base.name,
    map:
      tablePrimary(base.table) === pk
        ? { kind: "identity" }
        : { kind: "identity", column: pk.name },
    columns,
  };
}

/**
 * Mint a keyed compile's plan (the one production `mintRoutePlan` caller).
 *
 * Refuses a `reverse` route beside an `identity` route that `encode`s its
 * ids (a union arm's `kind:id`): a reverse probe answers the host pk's own
 * values, and its `within` is cut from the snapshot's (encoded) keys, so both
 * would be in the wrong key space — the probe would name the wrong hosts and
 * its cast would fail. A compiler emitting both must encode the answer and
 * decode `within` through the identity's codec first.
 */
export function compiledRoutePlan<P extends ResourceParams>(
  routes: readonly Route[],
  usesOf: (params: P) => ReadonlyMap<string, TupleUse>,
): RoutePlan<P> {
  const encoded = routes.find(
    (r) => r.map.kind === "identity" && r.map.encode !== undefined,
  );
  const reverse = routes.find((r) => r.map.kind === "reverse");
  if (encoded !== undefined && reverse !== undefined) {
    throw new Error(
      `a reverse route ("${reverse.id}") beside an encoded identity route ("${encoded.id}") — the reverse probe answers raw host ids and reads \`within\` as raw ids, but this compile's host ids are encoded. Encode the answer and decode \`within\` through the identity's codec before emitting both.`,
    );
  }
  return mintRoutePlan({ routes, usesOf });
}

/**
 * Mint a non-keyed aggregate's plan (a collection's `:groups`): `full` routes
 * only — any written row may move any count, so a relevant change recomputes
 * the tuple, and a change to a table the tuple does not read reaches nothing.
 */
export function compiledReachPlan<P extends ResourceParams>(
  routes: readonly FullRoute[],
  usesOf: (params: P) => ReadonlyMap<string, TupleUse>,
): ReachPlan<P> {
  return mintReachPlan({ routes, usesOf });
}

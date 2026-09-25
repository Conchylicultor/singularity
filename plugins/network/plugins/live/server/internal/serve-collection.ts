import { and, getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { Resource as ResourceContribution } from "@plugins/framework/plugins/server-core/core";
import type { Resource } from "@plugins/framework/plugins/resource-runtime/core";
import type { PointParams } from "@plugins/primitives/plugins/live-state/core";
import {
  windowQueryResource,
  type EntitySource,
  type QueryDb,
  type WindowOrderKey,
  type WindowQueryResourceSpec,
} from "@plugins/infra/plugins/query-resource/server";
import type {
  LiveCollection,
  LiveWindowParams,
} from "@plugins/network/plugins/live/core";
import { liveClauseSql } from "./op-sql";

// `serveCollection` — the server half of a `liveCollection`. One call binds the
// declaration's filterable and sortable names to the table's columns and
// compiles BOTH minted resources through the existing bounded compiler
// (`windowQueryResource`): the window (where / order decoded per subscription
// tuple) and the `:rows` point sibling (explicit id sets, no filter). Nothing
// here is a new runtime path — only the specs are derived.

/** A table, or an `infra/entities` Entity (read through its table). */
export type CollectionSource = PgTable | EntitySource;

/** The column property names `from` exposes. */
type ColumnNamesOf<T> = T extends EntitySource
  ? keyof T["wireColumns"] & string
  : T extends PgTable
    ? keyof T["_"]["columns"] & string
    : never;

/** Every name the collection filters or sorts by — each must bind to a column. */
type BoundNames<F, S extends string> = (keyof F & string) | S;

/**
 * `columns` is optional while every filterable / sortable name is a column of
 * `from` by property name, and REQUIRED — naming exactly the missing ones —
 * when some are not (a renamed column). A name bound nowhere is a tsc error.
 */
type ColumnOverrides<T, N extends string> = [
  Exclude<N, ColumnNamesOf<T>>,
] extends [never]
  ? { columns?: { [K in N]?: PgColumn } }
  : {
      columns: { [K in N]?: PgColumn } & {
        [K in Exclude<N, ColumnNamesOf<T>>]: PgColumn;
      };
    };

export type ServeCollectionOptions<
  T extends CollectionSource,
  F,
  S extends string,
> = {
  from: T;
  /** Test seam. Defaults to the real per-worktree drizzle `db`. */
  db?: QueryDb;
} & ColumnOverrides<T, BoundNames<F, S>>;

export interface CollectionSpecs {
  window: WindowQueryResourceSpec<LiveWindowParams>;
  rows: WindowQueryResourceSpec<PointParams>;
}

export interface ServedCollection<Row> {
  /** The window resource (`key`). */
  window: Resource<Row[], LiveWindowParams>;
  /** The point sibling (`${key}:rows`). */
  rows: Resource<Row[], PointParams>;
  /** Spread into the plugin's `contributions`: one `Resource.Declare` per minted resource. */
  declare: [
    ReturnType<typeof ResourceContribution.Declare>,
    ReturnType<typeof ResourceContribution.Declare>,
  ];
}

function isEntitySource(from: CollectionSource): from is EntitySource {
  return "wireColumns" in from && "table" in from;
}

/**
 * Derive the two bounded specs for a collection. Exported apart from
 * `serveCollection` (which also registers) so a test can compile them against
 * a fake or throwaway `db` and its own runtime — the `compileWindowQuery`
 * pattern. Every binding miss throws here, at module eval.
 */
export function compileCollection<
  Row,
  F,
  S extends string,
  T extends CollectionSource,
>(
  collection: LiveCollection<Row, F, S>,
  opts: ServeCollectionOptions<T, F, S>,
): CollectionSpecs {
  const fail = (message: string): never => {
    throw new Error(`serveCollection("${collection.key}"): ${message}`);
  };
  const from: CollectionSource = opts.from;
  const table = isEntitySource(from) ? from.table : from;
  const tableColumns = getTableColumns(table) as Record<string, PgColumn>;
  const overrides = (opts.columns ?? {}) as Record<
    string,
    PgColumn | undefined
  >;
  const columnOf = (name: string): PgColumn =>
    overrides[name] ??
    tableColumns[name] ??
    fail(
      `"${name}" binds to no column of the source — pass it in \`columns\`.`,
    );

  const filterable = Object.keys(collection.filterable as object);
  const bound = new Map<string, PgColumn>();
  for (const name of [...filterable, ...collection.sortable, collection.id]) {
    bound.set(name, columnOf(name));
  }
  // The comparison target is the column RENDERED as SQL, never the column
  // object: an operand is not a stored value, and a column would run its
  // write-side encoder over it (see `op-sql.ts`).
  const target = (name: string): SQL => sql`${bound.get(name)!}`;

  const codec = collection.window.window;
  const where = (params: LiveWindowParams): SQL | undefined => {
    const clauses = codec.decode(params).where;
    if (clauses.length === 0) return undefined;
    return and(...clauses.map((c) => liveClauseSql(target(c.column), c)));
  };
  const orderBy = (params: LiveWindowParams): WindowOrderKey[] =>
    codec.decode(params).orderBy.map(([name, dir]) => {
      const col = bound.get(name)!;
      return { col, dir, nullable: !col.notNull };
    });

  return {
    window: {
      from: opts.from,
      where,
      orderBy,
      // Every sortable column: one order signature per resource, so an UPDATE
      // to any of them re-derives each member tuple's window.
      signatureColumns: collection.sortable.map((name) => bound.get(name)!),
      window: {}, // maxLimit comes from the declaration's codec
      ...(opts.db ? { db: opts.db } : {}),
    },
    rows: {
      from: opts.from,
      point: { by: bound.get(collection.id)! },
      ...(opts.db ? { db: opts.db } : {}),
    },
  };
}

/**
 * Serve a `liveCollection` from a table (or Entity). Filterable and sortable
 * names bind to columns by property name — type-checked against `from`; a
 * renamed column goes in `columns`. Returns both compiled resources and their
 * `Resource.Declare` contributions:
 *
 * ```ts
 * export const eventSourcesServed = serveCollection(eventSources, { from: _eventSources });
 * // contributions: [...eventSourcesServed.declare]
 * ```
 */
export function serveCollection<
  Row,
  F,
  S extends string,
  T extends CollectionSource,
>(
  collection: LiveCollection<Row, F, S>,
  opts: ServeCollectionOptions<T, F, S>,
): ServedCollection<Row> {
  const specs = compileCollection(collection, opts);
  const window = windowQueryResource(collection.window, specs.window);
  const rows = windowQueryResource(collection.rows, specs.rows);
  return {
    window,
    rows,
    declare: [
      ResourceContribution.Declare(window),
      ResourceContribution.Declare(rows),
    ],
  };
}

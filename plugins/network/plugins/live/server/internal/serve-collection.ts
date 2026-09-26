import { and, count, getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db as realDb } from "@plugins/database/server";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type {
  Filter,
  Filterable,
  FilterScalar,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { filterSql } from "@plugins/network/plugins/live/plugins/filter/server";
import {
  defineResource,
  Resource as ResourceContribution,
} from "@plugins/framework/plugins/server-core/core";
import type {
  Resource,
  ServerResourceOptions,
} from "@plugins/framework/plugins/resource-runtime/core";
import type { PointParams } from "@plugins/primitives/plugins/live-state/core";
import {
  columnWireCodec,
  type ColumnWire,
  type WireCodec,
} from "@plugins/database/plugins/sql-column/server";
import {
  windowQueryResource,
  type EntitySource,
  type QueryDb,
  type SelectMap,
  type WindowOrderKey,
  type WindowQueryResourceSpec,
} from "@plugins/infra/plugins/query-resource/server";
import type {
  LiveCollection,
  LiveGroup,
  LiveGroupParams,
  LiveLookupCollection,
  LiveWindowParams,
} from "@plugins/network/plugins/live/core";

// `serveCollection` — the server half of a `liveCollection`. One call binds the
// declaration's row fields to the table's columns and compiles all THREE minted
// resources: the window (where / order decoded per subscription tuple) and the
// `:rows` point sibling through the existing bounded compiler
// (`windowQueryResource`), and `:groups` as a plain push value per grouping
// query (`GROUP BY` the column, re-run by the runtime whenever a table it read
// changes — the read-set is captured automatically, so it needs no scope
// policy). Nothing here is a new runtime path — only the specs are derived.
// A lookup-only collection (declared without a default window) mints `:rows`
// alone, so only that point resource is compiled and served.

/** A table, or an `infra/entities` Entity (read through its table). */
export type CollectionSource = PgTable | EntitySource;

/** The columns `from` exposes, by property name. */
type ColumnsOf<T> = T extends EntitySource
  ? T["wireColumns"]
  : T extends PgTable
    ? T["_"]["columns"]
    : never;

/** The column property names `from` exposes. */
type ColumnNamesOf<T> = keyof ColumnsOf<T> & string;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Row fields bound by name to a column that declares a wire form (sql-column's
 * `withWire`) whose wire type the field is not — e.g. a `bytea` column's field
 * typed as bytes instead of its base64 `string`.
 */
type WireMismatch<T, Row> = {
  [K in keyof Row & ColumnNamesOf<T>]: ColumnWire<ColumnsOf<T>[K]> extends {
    wire: infer W;
  }
    ? Same<Row[K], W> extends true
      ? never
      : K
    : never;
}[keyof Row & ColumnNamesOf<T>];

/** A wire-type mismatch is a REQUIRED property of type `never`, naming the field: a tsc error. */
type WireCheck<T, Row> = [WireMismatch<T, Row>] extends [never]
  ? unknown
  : {
      [
        K in WireMismatch<T, Row> &
          string as `row field "${K}" must be its column's wire type (sql-column withWire)`
      ]: never;
    };

/**
 * `columns` is optional while every row field is a column of `from` by
 * property name, and REQUIRED — naming exactly the missing ones — when some
 * are not (a renamed column). A row field bound nowhere is a tsc error.
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

export type ServeCollectionOptions<T extends CollectionSource, Row> = {
  from: T;
  /**
   * The collection's base membership: the collection IS the rows of `from`
   * matching it (e.g. `eq(t.dismissed, false)`). ANDed into the window, the
   * `:rows` point reads and every grouping. A mutable column is fine — a flip
   * is a membership exit for the window and the point set, and a recount for
   * the groups.
   */
  where?: SQL;
  /** Test seam. Defaults to the real per-worktree drizzle `db`. */
  db?: QueryDb;
} & ColumnOverrides<T, keyof Row & string> &
  WireCheck<T, Row>;

/** A lookup-only collection's one spec: the `:rows` point read. */
export interface LookupCollectionSpecs {
  rows: WindowQueryResourceSpec<PointParams>;
  /** The derived projection: exactly the row schema's keys. */
  select: SelectMap;
}

export interface CollectionSpecs extends LookupCollectionSpecs {
  window: WindowQueryResourceSpec<LiveWindowParams>;
  /** The `:groups` server half — the two-arg `defineResource` opts. */
  groups: ServerResourceOptions<LiveGroup<FilterScalar>[], LiveGroupParams> & {
    mode: "push";
  };
}

export interface ServedCollection<Row> {
  /** The window resource (`key`). */
  window: Resource<Row[], LiveWindowParams>;
  /** The point sibling (`${key}:rows`). */
  rows: Resource<Row[], PointParams>;
  /** The groups sibling (`${key}:groups`). */
  groups: Resource<LiveGroup<FilterScalar>[], LiveGroupParams>;
  /** Every minted key — `[key, key:rows, key:groups]`. */
  keys: string[];
  /** Spread into the plugin's `contributions`: one `Resource.Declare` per minted resource. */
  declare: [
    ReturnType<typeof ResourceContribution.Declare>,
    ReturnType<typeof ResourceContribution.Declare>,
    ReturnType<typeof ResourceContribution.Declare>,
  ];
}

/** A lookup-only collection, served: its one minted resource, `${key}:rows`. */
export interface ServedLookupCollection<Row> {
  /** The point resource (`${key}:rows`) — the only one a lookup-only collection mints. */
  rows: Resource<Row[], PointParams>;
  /** Every minted key — `[key:rows]`. */
  keys: [string];
  /** Spread into the plugin's `contributions`: the one `Resource.Declare`. */
  declare: [ReturnType<typeof ResourceContribution.Declare>];
}

function isEntitySource(from: CollectionSource): from is EntitySource {
  return "wireColumns" in from && "table" in from;
}

/**
 * Derive the specs for a collection — three, or just `rows` for a lookup-only
 * one. Exported apart from `serveCollection` (which also registers) so a test
 * can compile them against a fake or throwaway `db` and its own runtime — the
 * `compileWindowQuery` pattern. Every binding miss throws here, at module eval.
 */
export function compileCollection<
  Row,
  F,
  S extends string,
  T extends CollectionSource,
>(
  collection: LiveCollection<Row, F, S>,
  opts: ServeCollectionOptions<T, Row>,
): CollectionSpecs;
export function compileCollection<Row, T extends CollectionSource>(
  collection: LiveLookupCollection<Row>,
  opts: ServeCollectionOptions<T, Row>,
): LookupCollectionSpecs;
export function compileCollection<
  Row,
  F,
  S extends string,
  T extends CollectionSource,
>(
  collection: LiveCollection<Row, F, S> | LiveLookupCollection<Row>,
  opts: ServeCollectionOptions<T, Row>,
): CollectionSpecs | LookupCollectionSpecs {
  const fail = (message: string): never => {
    throw new Error(`serveCollection("${collection.key}"): ${message}`);
  };
  const from: CollectionSource = opts.from;
  const table = isEntitySource(from) ? from.table : from;
  // An entity binds through its WIRE columns — the ones it already agreed to
  // put on the wire — never a server-only column of its table.
  const sourceColumns: Record<string, PgColumn> = isEntitySource(from)
    ? from.wireColumns
    : (getTableColumns(table) as Record<string, PgColumn>);
  const overrides = (opts.columns ?? {}) as Record<
    string,
    PgColumn | undefined
  >;
  const columnOf = (name: string): PgColumn =>
    overrides[name] ??
    sourceColumns[name] ??
    fail(
      `row field "${name}" binds to no column of the source — pass it in \`columns\`.`,
    );

  // The projection IS the row schema: every row field bound to a column, and
  // nothing else — so a server-only column (a dedup key) cannot reach the
  // wire. Filterable / sortable / id names are row fields by type; each is
  // checked here too, since a binding is a runtime fact.
  const bound = new Map<string, PgColumn>();
  for (const name of collection.rowKeys) bound.set(name, columnOf(name));
  const lists = collection.window !== undefined;
  const filterable = lists ? Object.keys(collection.filterable as object) : [];
  const sortable: readonly string[] = lists ? collection.sortable : [];
  for (const name of [...filterable, ...sortable, collection.id]) {
    if (!bound.has(name)) fail(`"${name}" is not a field of the row schema.`);
  }
  const select: SelectMap = Object.fromEntries(bound);

  // A column type's wire form (sql-column `withWire`), applied in JS to every
  // row a loader returns — the field's type is the codec's wire type (tsc).
  const wired: [string, WireCodec<unknown, unknown>][] = [];
  for (const [name, col] of bound) {
    const codec = columnWireCodec(col);
    if (codec) wired.push([name, codec]);
  }
  for (const [name] of wired) {
    if (filterable.includes(name) || name === collection.id) {
      fail(
        `"${name}" is a wire-encoded column — it cannot be filtered, grouped ` +
          `or be the id: an operand, a group value and an id are compared as ` +
          `stored, not as they cross the wire.`,
      );
    }
  }
  const encodeRow =
    wired.length === 0
      ? undefined
      : (row: Record<string, unknown>): Record<string, unknown> => {
          const out = { ...row };
          for (const [name, codec] of wired) {
            const value = out[name];
            if (value !== null) out[name] = codec.encode(value);
          }
          return out;
        };
  const withEncode = encodeRow ? { encodeRow } : {};
  const base = opts.where;
  // One boundary cast — the `compileWindowQuery` precedent.
  const db: QueryDb = opts.db ?? (realDb as unknown as QueryDb);
  const withDb = opts.db ? { db: opts.db } : {};
  const rows: WindowQueryResourceSpec<PointParams> = {
    from: opts.from,
    select,
    point: { by: bound.get(collection.id)! },
    // A base-where flip makes the refill omit a requested id — the point
    // path's membership exit, so the row leaves the tuple.
    ...(base ? { where: base } : {}),
    ...withEncode,
    ...withDb,
  };
  if (collection.window === undefined) return { rows, select };

  // The filter language's declaration, and each filterable column's target:
  // the column RENDERED as SQL, never the column object — an operand is not a
  // stored value, and a column would run its write-side encoder over it.
  const filterDecl = collection.filterable as unknown as Filterable;
  const targets: Record<string, SQL> = Object.fromEntries(
    filterable.map((name) => [name, sql`${bound.get(name)!}`]),
  );
  const filterWhere = (filter: Filter | undefined): SQL | undefined =>
    filterSql(filter, targets, filterDecl);

  const allOf = (parts: (SQL | undefined)[]): SQL | undefined => {
    const present = parts.filter((p): p is SQL => p !== undefined);
    return present.length === 0 ? undefined : and(...present);
  };

  const codec = collection.window.window;
  const where = (params: LiveWindowParams): SQL | undefined =>
    allOf([base, filterWhere(codec.decode(params).where)]);
  const orderBy = (params: LiveWindowParams): WindowOrderKey[] =>
    codec.decode(params).orderBy.map(([name, dir]) => {
      const col = bound.get(name)!;
      return { col, dir, nullable: !col.notNull };
    });

  const groupCodec = collection.groups.groups;
  // A group value is a STORED value, so it is checked against the row schema's
  // field — never against the filterable declaration, whose operand narrowing
  // (`liveText(Enum)`) is tsc-only and says nothing about what a column holds.
  const rowShape = collection.row.shape as Readonly<Record<string, unknown>>;
  const fieldSchema = (name: string): ZodParser<unknown> => {
    const schema = rowShape[name] as Partial<ZodParser<unknown>> | undefined;
    if (typeof schema?.safeParse !== "function") {
      return fail(`row schema field "${name}" is not a zod schema.`);
    }
    return schema as ZodParser<unknown>;
  };
  const groupSchemas = new Map(filterable.map((n) => [n, fieldSchema(n)]));
  // `SELECT col AS value, count(*) … GROUP BY col ORDER BY count DESC, col`.
  // NULL is its own group (sorted last among equal counts); `C` collation makes
  // the value tiebreak code-point order, matching the filter language's
  // `compareScalars`. The wire schema is shared by every column, so this is
  // where a value the row type could never hold (an enum drifted past its
  // schema) fails loudly.
  const groupsLoader = async (
    params: LiveGroupParams,
  ): Promise<LiveGroup<FilterScalar>[]> => {
    const q = groupCodec.decode(params);
    const col = bound.get(q.groupBy)!;
    const predicate = allOf([base, filterWhere(q.where)]);
    let query = db
      .select<LiveGroup<FilterScalar>>({
        value: col,
        count: count().as("count"),
      })
      .from(table);
    if (predicate) query = query.where(predicate);
    const rows = await query
      .groupBy(col)
      .orderBy(sql`count(*) DESC`, sql`${col} ASC NULLS LAST`)
      .limit(q.limit);
    const schema = groupSchemas.get(q.groupBy)!;
    for (const row of rows) {
      if (row.value === null) continue;
      if (!schema.safeParse(row.value).success) {
        fail(
          `group value ${JSON.stringify(row.value)} of "${q.groupBy}" does not parse ` +
            `as the row schema's field — the column holds a value the row type cannot.`,
        );
      }
    }
    return rows;
  };

  return {
    window: {
      from: opts.from,
      select,
      where,
      orderBy,
      // Every sortable column: one order signature per resource, so an UPDATE
      // to any of them re-derives each member tuple's window.
      signatureColumns: collection.sortable.map((name) => bound.get(name)!),
      window: {}, // maxLimit comes from the declaration's codec
      ...withEncode,
      ...withDb,
    },
    rows,
    groups: { mode: "push", loader: groupsLoader },
    select,
  };
}

/**
 * Serve a `liveCollection` from a table (or Entity). Row fields bind to
 * columns by property name — type-checked against `from`; a renamed column
 * goes in `columns`. The projection is exactly the row schema's fields.
 * A column whose type declares a wire form (sql-column `withWire`, e.g. a
 * `bytea`) is encoded in JS on every row, and its row field must be typed as
 * the wire type. Returns the compiled resources, their keys, and their
 * `Resource.Declare` contributions — all three for a full collection, `:rows`
 * alone for a lookup-only one:
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
  opts: ServeCollectionOptions<T, Row>,
): ServedCollection<Row>;
export function serveCollection<Row, T extends CollectionSource>(
  collection: LiveLookupCollection<Row>,
  opts: ServeCollectionOptions<T, Row>,
): ServedLookupCollection<Row>;
export function serveCollection<
  Row,
  F,
  S extends string,
  T extends CollectionSource,
>(
  collection: LiveCollection<Row, F, S> | LiveLookupCollection<Row>,
  opts: ServeCollectionOptions<T, Row>,
): ServedCollection<Row> | ServedLookupCollection<Row> {
  if (collection.window === undefined) {
    const specs = compileCollection(collection, opts);
    const rows = windowQueryResource(collection.rows, specs.rows);
    return {
      rows,
      keys: [rows.key],
      declare: [ResourceContribution.Declare(rows)],
    };
  }
  const specs = compileCollection(collection, opts);
  const window = windowQueryResource(collection.window, specs.window);
  const rows = windowQueryResource(collection.rows, specs.rows);
  const groups = defineResource(collection.groups, specs.groups);
  return {
    window,
    rows,
    groups,
    keys: [window.key, rows.key, groups.key],
    declare: [
      ResourceContribution.Declare(window),
      ResourceContribution.Declare(rows),
      ResourceContribution.Declare(groups),
    ],
  };
}

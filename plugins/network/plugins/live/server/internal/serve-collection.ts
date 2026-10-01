import { and, getTableColumns, getTableName, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import {
  filterColumns,
  type Filter,
  type Filterable,
  type FilterScalar,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { filterSql } from "@plugins/network/plugins/live/plugins/filter/server";
import {
  defineDeferredResource,
  defineResource,
  onDeferredResourcesBound,
  Resource as ResourceContribution,
} from "@plugins/framework/plugins/server-core/core";
import type { Resource } from "@plugins/framework/plugins/resource-runtime/core";
import type { PointParams } from "@plugins/primitives/plugins/live-state/core";
import {
  columnWireCodec,
  type ColumnWire,
  type WireCodec,
} from "@plugins/database/plugins/sql-column/server";
import {
  BASE_RELATION,
  type ColumnRef,
  type JoinColumns,
  type JoinRef,
  type JoinRefs,
  type JoinSpec,
} from "@plugins/infra/plugins/query-resource/core";
import {
  compileGroupsQuery,
  compileJoins,
  deferredWindowQueryResource,
  joinRefs,
  windowQueryResource,
  type CompiledGroups,
  type ReadColumn,
  type EntitySource,
  type QueryDb,
  type RoutedSource,
  type SelectMap,
  type WindowOrderKey,
  type WindowQueryResourceSpec,
} from "@plugins/infra/plugins/query-resource/server";
import {
  LIVE_COLUMNS_KEY,
  LIVE_ROW_KEY,
  LIVE_ROW_KEY_MAX_BYTES,
  LIVE_SCOPED_KEY,
  scopedLiveColumns,
  type LiveCollection,
  type LiveColumnsDeclaration,
  type LiveGroup,
  type LiveGroupParams,
  type LiveLookupCollection,
  type LiveWindowParams,
} from "@plugins/network/plugins/live/core";
import {
  LiveColumns,
  type ServedColumns,
  type ServedScopedColumns,
} from "./serve-columns";

// `serveCollection` — the server half of a `liveCollection`. One call binds the
// declaration's row fields to the table's columns and compiles all THREE minted
// resources through query-resource: the window (where / order decoded per
// subscription tuple) and the `:rows` point sibling through the bounded
// compiler (`windowQueryResource`), and `:groups` through the grouping compiler
// (`compileGroupsQuery`: a push value per grouping query, `GROUP BY` the
// column). All three are ROUTED — each compiler emits the routes its SQL reads
// (the base table's and each declared join's — `joins`, bound to row fields
// through `(j) => ColumnRef` overrides), so the runtime's `routeTableChange`
// serves them and a write to a table a tuple does not read never reaches it.
// Nothing here is a runtime path — only the specs are derived. A lookup-only collection (declared without a default window) mints
// `:rows` alone, so only that point resource is compiled and served.

/** A table, or an `infra/entities` Entity (read through its table). Never a view. */
export type CollectionSource = RoutedSource;

/** The table `from` reads. */
type TableOf<T> = T extends EntitySource
  ? T["table"]
  : T extends PgTable
    ? T
    : never;

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
 * A row field bound to a wire column of the base or of a declared join:
 * `(j) => j.base.title` / `(j) => j.playback.lastPlayedAt`. It returns one of
 * the refs `j` offers, so a relation that is not declared, a server-only
 * column, or a hand-written ref naming another table's column cannot be
 * spelled (T2 of research/2026-09-29-global-scoped-change-routing.md).
 */
export type ColumnOverride<
  T extends CollectionSource,
  J extends readonly JoinSpec[],
> = (j: JoinRefs<ColumnsOf<T>, J>) => JoinRef<JoinRefs<ColumnsOf<T>, J>>;

/**
 * `columns` is optional while every row field is a column of `from` by
 * property name, and REQUIRED — naming exactly the missing ones — when some
 * are not (a renamed column, or a joined one). A row field bound nowhere is a
 * tsc error.
 */
type ColumnOverrides<
  T extends CollectionSource,
  N extends string,
  J extends readonly JoinSpec[],
> = [Exclude<N, ColumnNamesOf<T>>] extends [never]
  ? { columns?: { [K in N]?: ColumnOverride<T, J> } }
  : {
      columns: { [K in N]?: ColumnOverride<T, J> } & {
        [K in Exclude<N, ColumnNamesOf<T>>]: ColumnOverride<T, J>;
      };
    };

/**
 * The row fields a collection binds to columns: every key of its row but
 * `$columns`, which a contributed collection folds its contributors into.
 */
type BoundFields<Row> = Exclude<keyof Row & string, typeof LIVE_COLUMNS_KEY>;

export type ServeCollectionOptions<
  T extends CollectionSource,
  Row,
  J extends readonly JoinSpec[] = readonly [],
  // The columns a default scope's `unless` may name: the collection's own
  // filterable names (`never` for a lookup-only collection, which has no
  // filter to drop a default by).
  U extends string = BoundFields<Row>,
> = {
  from: T;
  /**
   * Tables joined onto `from` (an extension handle's `join(alias)`, a lookup, a
   * keyed side table), their columns bound to row fields through `columns`.
   * Each is routed: a write to a joined row refills the host rows reading it,
   * and only the tuples whose SQL reads the join (see
   * `plugins/infra/plugins/query-resource/CLAUDE.md`, *Joins*).
   */
  joins?: J;
  /**
   * The collection's base membership: the collection IS the rows of `from`
   * matching it (e.g. `eq(t.dismissed, false)`). ANDed into the window, the
   * `:rows` point reads and every grouping. A mutable column is fine — a flip
   * is a membership exit for the window and the point set, and a recount for
   * the groups. A predicate over the joins is written against their rendered
   * columns — `(j) => gt(j.playback.plays, 0)` — and makes each join it reads
   * membership for every tuple.
   */
  where?: SQL | ((j: JoinColumns<TableOf<T>, J>) => SQL);
  /**
   * DEFAULT scopes: each predicate is ANDed into a window or grouping tuple
   * UNLESS that tuple's filter names its `unless` column (with any op). A
   * default, not base membership — a view that asks about the column gets
   * exactly what it asked for: events hide a disabled source's events, and a
   * filter on `sourceId` shows them. Written like `where` (over the joins'
   * rendered columns), and like it routed: a join a default reads is
   * membership for the tuples it applies to. Never ANDed into the `:rows`
   * point read, which ignores every client filter.
   */
  defaults?: readonly DefaultScope<T, Row, J, U>[];
  /** Test seam. Defaults to the real per-worktree drizzle `db`. */
  db?: QueryDb;
} & ColumnOverrides<T, BoundFields<Row>, J> &
  WireCheck<T, Row>;

/** One default scope of a collection (see `ServeCollectionOptions.defaults`). */
export interface DefaultScope<
  T extends CollectionSource,
  Row,
  J extends readonly JoinSpec[] = readonly [],
  U extends string = BoundFields<Row>,
> {
  /** The filterable column whose mention in a tuple's filter drops this default. */
  unless: U;
  where: SQL | ((j: JoinColumns<TableOf<T>, J>) => SQL);
}

/** A lookup-only collection's one spec: the `:rows` point read. */
export interface LookupCollectionSpecs {
  rows: WindowQueryResourceSpec<PointParams>;
  /** The derived projection: exactly the row schema's keys. */
  select: SelectMap;
}

export interface CollectionSpecs extends LookupCollectionSpecs {
  window: WindowQueryResourceSpec<LiveWindowParams>;
  /** The `:groups` server half — the two-arg `defineResource` opts, routed by `reach`. */
  groups: CompiledGroups<LiveGroup<FilterScalar>, LiveGroupParams>;
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
  const J extends readonly JoinSpec[] = readonly [],
>(
  collection: LiveCollection<Row, F, S>,
  opts: ServeCollectionOptions<T, Row, J, keyof F & string>,
  contributed?: readonly ServedColumns[],
  scoped?: readonly ServedScopedColumns[],
): CollectionSpecs;
export function compileCollection<
  Row,
  T extends CollectionSource,
  const J extends readonly JoinSpec[] = readonly [],
>(
  collection: LiveLookupCollection<Row>,
  // `string`, not `never`: the compile is what refuses a lookup's defaults at
  // runtime (serveCollection's own lookup overload is the typed `never`).
  opts: ServeCollectionOptions<T, Row, J, string>,
): LookupCollectionSpecs;
export function compileCollection<
  Row,
  F,
  S extends string,
  T extends CollectionSource,
  const J extends readonly JoinSpec[] = readonly [],
>(
  collection: LiveCollection<Row, F, S> | LiveLookupCollection<Row>,
  opts: ServeCollectionOptions<T, Row, J, string>,
  contributed: readonly ServedColumns[] = [],
  scoped: readonly ServedScopedColumns[] = [],
): CollectionSpecs | LookupCollectionSpecs {
  const fail = (message: string): never => {
    throw new Error(`serveCollection("${collection.key}"): ${message}`);
  };
  const isContributed =
    (collection as { contributed?: boolean }).contributed === true;
  if (contributed.length > 0 && !isContributed) {
    fail(
      "contributed columns were served for a collection not declared `contributed: true`",
    );
  }
  // Each contributor's handle, by name — two contributions of one name would
  // fold into one `$columns` slot.
  const handles: LiveColumnsDeclaration[] = [];
  for (const c of contributed) {
    if (c.handle.collection !== collection.key) {
      fail(
        `contributed columns "${c.handle.name}" belong to "${c.handle.collection}"`,
      );
    }
    // The type admits only an extension join; a cast past it would widen the
    // base collection's semantics (an INNER lookup drops hosts).
    if ((c.join as { kind: string }).kind !== "extension") {
      fail(
        `contributed columns "${c.handle.name}" are read through a "${(c.join as { kind: string }).kind}" join — a contributor may only join an extension (\`ext.join(alias)\`)`,
      );
    }
    if (handles.some((h) => h.name === c.handle.name)) {
      fail(
        `two LiveColumns.Serve contributions are named "${c.handle.name}" — a contributor's name is its \`$columns\` slot`,
      );
    }
    handles.push(c.handle);
  }
  const from: CollectionSource = opts.from;
  const table = isEntitySource(from) ? from.table : from;
  // An entity binds through its WIRE columns — the ones it already agreed to
  // put on the wire — never a server-only column of its table.
  const sourceColumns: Record<string, PgColumn> = isEntitySource(from)
    ? from.wireColumns
    : (getTableColumns(table) as Record<string, PgColumn>);
  const overrides = (opts.columns ?? {}) as Record<
    string,
    ((j: unknown) => ColumnRef) | undefined
  >;
  const joinSpecs: readonly JoinSpec[] = [
    ...(opts.joins ?? []),
    ...contributed.map((c) => c.join),
  ];
  const refs = joinRefs(sourceColumns, joinSpecs);
  const refOf = (name: string): ColumnRef => {
    const override = overrides[name];
    if (override) return override(refs);
    const col = sourceColumns[name];
    return col
      ? { from: BASE_RELATION, col }
      : fail(
          `row field "${name}" binds to no column of the source — pass it in \`columns\`.`,
        );
  };
  // The id binds to the base table — it IS the host identity every join and
  // route is keyed by — so it is resolved before the joins are rendered.
  const idRef = refOf(collection.id);
  if (idRef.from !== BASE_RELATION) {
    fail(
      `the id "${collection.id}" binds to join "${idRef.from}" — a collection's id is its base table's column.`,
    );
  }
  // Scoped column sets (a DataView surface's custom columns): one join family
  // per set, bound to the collection's scope — members joined per tuple.
  const scope =
    (collection as { columnScope?: string | null }).columnScope ?? null;
  if (scoped.length > 0 && scope === null) {
    fail(
      "scoped column sets were served for a collection that declares no `columnScope`",
    );
  }
  const scopedByName = new Map<string, ServedScopedColumns>();
  for (const set of scoped) {
    if (
      scopedByName.has(set.name) ||
      handles.some((h) => h.name === set.name)
    ) {
      fail(
        `two column sets are named "${set.name}" — a set's name prefixes its wire names`,
      );
    }
    scopedByName.set(set.name, set);
  }
  const families = scope === null ? [] : scoped.map((s) => s.bind(scope));
  // The declared joins, rendered and checked once here (A4): every row field
  // bound to a join renders against its alias, so the SQL names its relation.
  const joins = compileJoins(
    { table, name: getTableName(table) },
    joinSpecs,
    idRef.col,
    `serveCollection("${collection.key}")`,
    families,
  );

  // The projection IS the row schema: every row field bound to a column, and
  // nothing else — so a server-only column (a dedup key) cannot reach the
  // wire. Filterable / sortable / id names are row fields by type; each is
  // checked here too, since a binding is a runtime fact.
  const bound = new Map<string, ReadColumn>();
  // Each field's ref: the table's OWN column — what sql-column's wire codec is
  // registered against (a join's rendered column is an alias proxy, a
  // different object).
  const boundRefs = new Map<string, ColumnRef>();
  for (const name of collection.rowKeys) {
    const ref = name === collection.id ? idRef : refOf(name);
    bound.set(name, joins.render(ref));
    // A ref `j` did not offer: a server-only column (the types stop a
    // literal `j` never made; this stops a cast).
    if (!Object.values(refs[ref.from] ?? {}).some((r) => r.col === ref.col)) {
      fail(
        `row field "${name}" binds to "${ref.from}"."${ref.col.name}", which is not a wire column of that relation — a server-only column never reaches the wire.`,
      );
    }
    boundRefs.set(name, ref);
  }
  // Contributed columns: each contributor's fields, read through its own join
  // (by property name, or its override) and projected flat under their wire
  // names (`<contributor>.<field>`); every row folds them into `$columns`.
  const contributedFields = new Map<
    string,
    { contributor: string; field: string; schema: unknown }
  >();
  for (const c of contributed) {
    const alias = c.join.alias;
    const own = { [alias]: refs[alias] };
    const shape = c.handle.rowShape;
    for (const field of c.handle.fields) {
      const wire = c.handle.wireName(field);
      const override = c.columns[field];
      const ref: ColumnRef = override
        ? override(own)
        : (refs[alias]?.[field] ??
          fail(
            `contributed field "${wire}" binds to no wire column of join "${alias}" — pass it in \`columns\`.`,
          ));
      if (
        ref.from !== alias ||
        !Object.values(refs[alias] ?? {}).some((r) => r.col === ref.col)
      ) {
        fail(
          `contributed field "${wire}" binds to "${ref.from}"."${ref.col.name}", which is not a wire column of its join "${alias}".`,
        );
      }
      bound.set(wire, joins.render(ref));
      boundRefs.set(wire, ref);
      contributedFields.set(wire, {
        contributor: c.handle.name,
        field,
        schema: shape[field],
      });
    }
  }
  const rowShape = collection.row.shape as Readonly<Record<string, unknown>>;
  const fieldSchema = (name: string): ZodParser<unknown> => {
    const schema = (contributedFields.get(name)?.schema ?? rowShape[name]) as
      Partial<ZodParser<unknown>> | undefined;
    if (typeof schema?.safeParse !== "function") {
      return fail(`row schema field "${name}" is not a zod schema.`);
    }
    return schema as ZodParser<unknown>;
  };
  // A column read through a LEFT join (its own or an ancestor's) is NULL for a
  // host with no joined row, whatever its own NOT NULL says — so its field
  // must accept null, or the first such host fails the row parse at load time.
  // A defaulted extension column reads its default instead (never NULL).
  for (const [name, col] of bound) {
    if (
      joins.outer(joins.relationOf(col)) &&
      joins.canBeNull(col) &&
      !fieldSchema(name).safeParse(null).success
    ) {
      fail(
        `row field "${name}" reads "${joins.relationOf(col)}"."${joins.columnOf(col).name}" through a LEFT join, which is NULL for a host with no joined row — make the field nullable.`,
      );
    }
  }
  const lists = collection.window !== undefined;
  // The collection's own filterable columns (what a grouping may read), and
  // with every contributor's (by wire name) what a window may read.
  const ownFilterable = lists
    ? Object.keys(collection.filterable as object)
    : [];
  const filterable = [
    ...ownFilterable,
    ...handles.flatMap((h) => Object.keys(h.wireFilterable)),
  ];
  const sortable: readonly string[] = lists
    ? [...collection.sortable, ...handles.flatMap((h) => h.wireSortable)]
    : [];
  for (const name of [...filterable, ...sortable, collection.id]) {
    if (!bound.has(name)) fail(`"${name}" is not a field of the row schema.`);
  }
  const select: SelectMap = Object.fromEntries(bound);

  // A column type's wire form (sql-column `withWire`), applied in JS to every
  // row a loader returns — the field's type is the codec's wire type (tsc).
  const wired: [string, WireCodec<unknown, unknown>][] = [];
  for (const [name, ref] of boundRefs) {
    const codec = columnWireCodec(ref.col);
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
  // A contributed collection's row: its contributors' flat wire-named values,
  // wire-encoded like any column, folded into `$columns[contributor][field]`
  // (every contributor present, so a row always carries each slice).
  const fold = (out: Record<string, unknown>): void => {
    const cols: Record<string, Record<string, unknown>> = Object.fromEntries(
      handles.map((h) => [h.name, {}]),
    );
    for (const [wire, { contributor, field }] of contributedFields) {
      cols[contributor]![field] = out[wire];
      delete out[wire];
    }
    out[LIVE_COLUMNS_KEY] = cols;
  };
  const encodeRow =
    wired.length === 0 && !isContributed
      ? undefined
      : (row: Record<string, unknown>): Record<string, unknown> => {
          const out = { ...row };
          for (const [name, codec] of wired) {
            const value = out[name];
            if (value !== null && value !== undefined) {
              out[name] = codec.encode(value);
            }
          }
          if (isContributed) fold(out);
          return out;
        };
  const withEncode = encodeRow ? { encodeRow } : {};
  // The order signature reads a sorted contributed column off `$columns`.
  const readField = (row: Record<string, unknown>, field: string): unknown => {
    const c = contributedFields.get(field);
    return c === undefined
      ? row[field]
      : (row[LIVE_COLUMNS_KEY] as Record<string, Record<string, unknown>>)[
          c.contributor
        ]![c.field];
  };
  const base =
    typeof opts.where === "function"
      ? opts.where(joins.columns() as JoinColumns<TableOf<T>, J>)
      : opts.where;
  // Every relation the base predicate reads must be the base or a declared
  // join — checked here, at module eval, for every shape it is ANDed into.
  if (base) joins.columnsIn(base);
  // The default scopes, rendered once like the base (and checked the same way).
  const defaults = (opts.defaults ?? []).map((d) => {
    const where =
      typeof d.where === "function"
        ? d.where(joins.columns() as JoinColumns<TableOf<T>, J>)
        : d.where;
    joins.columnsIn(where);
    return { unless: d.unless as string, where };
  });
  const withDb = opts.db ? { db: opts.db } : {};
  const withJoins = joinSpecs.length > 0 ? { joins: joinSpecs } : {};
  const rows: WindowQueryResourceSpec<PointParams> = {
    from: opts.from,
    select,
    ...withJoins,
    point: { by: joins.columnOf(bound.get(collection.id)!) },
    // A base-where flip makes the refill omit a requested id — the point
    // path's membership exit, so the row leaves the tuple.
    ...(base ? { where: base } : {}),
    ...withEncode,
    ...withDb,
  };
  if (collection.window === undefined) {
    if (defaults.length > 0) {
      fail(
        "`defaults` scope a list's filter — a lookup-only collection has none.",
      );
    }
    return { rows, select };
  }
  for (const d of defaults) {
    if (!ownFilterable.includes(d.unless)) {
      fail(
        `the default scope \`unless: "${d.unless}"\` names no filterable column — a default is dropped when a filter names its column, which it never could.`,
      );
    }
  }
  // The defaults a tuple's filter leaves standing.
  const defaultsFor = (filter: Filter | undefined): SQL[] => {
    if (defaults.length === 0) return [];
    const named = filterColumns(filter);
    return defaults.filter((d) => !named.has(d.unless)).map((d) => d.where);
  };

  // The filter language's declaration, and each filterable column's target:
  // the column RENDERED as SQL, never the column object — an operand is not a
  // stored value, and a column would run its write-side encoder over it.
  const filterDecl: Filterable = {
    ...(collection.filterable as unknown as Filterable),
    ...Object.assign({}, ...handles.map((h) => h.wireFilterable)),
  };
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
  // Every column set a query may name: the contributors served here, and the
  // scoped sets' members AS THEY STAND (a scope's members are data) — rebuilt
  // only when some set's members changed, so the codec's per-array memo holds.
  let declared: { key: string; all: readonly LiveColumnsDeclaration[] } = {
    key: "",
    all: handles,
  };
  const columnSets = (): readonly LiveColumnsDeclaration[] => {
    if (scope === null) return handles;
    const members = scoped.map((set) => [set, set.members(scope)] as const);
    const key = JSON.stringify(
      members.map(([set, m]) => [
        set.name,
        [...m].map(([id, r]) => [id, r.domain]),
      ]),
    );
    if (key !== declared.key) {
      declared = {
        key,
        all: [
          ...handles,
          ...members.map(([set, m]) =>
            scopedLiveColumns(
              scope,
              set.name,
              Object.fromEntries(
                [...m].map(([id, r]) => [
                  id,
                  { domain: r.domain, sortable: true },
                ]),
              ),
            ),
          ),
        ],
      };
    }
    return declared.all;
  };
  // A scoped member's value (`<set>.<member>`), rendered through its family's
  // join — cast as the member's type reads NOW. A member the scope no longer
  // has fails the load loudly (the scope's `recomputeOn` reloads its readers,
  // whose clients re-lower without it).
  const scopedRead = (name: string): ReadColumn | undefined => {
    if (scope === null) return undefined;
    const dot = name.indexOf(".");
    const set = dot < 0 ? undefined : scopedByName.get(name.slice(0, dot));
    if (set === undefined) return undefined;
    const member = name.slice(dot + 1);
    const read =
      set.members(scope).get(member) ??
      fail(`"${name}" is not a member of scope "${scope}"`);
    return joins.readMember(
      set.name,
      member,
      read.cast === undefined
        ? undefined
        : { cast: read.cast.sql, sqlType: read.cast.sqlType },
    );
  };
  // The server decodes against every column set it serves: a query may name
  // their columns, and nothing else. One strict decode per tuple's params
  // object — `where`, `orderBy`, `limitOf` and `cutsOf` each read it, on every
  // load of the tuple.
  const decodedByParams = new WeakMap<
    LiveWindowParams,
    ReturnType<typeof codec.decode>
  >();
  const decode = (params: LiveWindowParams) => {
    let decoded = decodedByParams.get(params);
    if (decoded === undefined) {
      decoded = codec.decode(params, columnSets());
      decodedByParams.set(params, decoded);
    }
    return decoded;
  };
  // A filter naming scoped members: its targets and declaration extended by
  // each member it names (rendered per load — a member's cast may move).
  const tupleFilterWhere = (filter: Filter | undefined): SQL | undefined => {
    if (filter === undefined) return undefined;
    const extra = [...filterColumns(filter)].filter((c) => !(c in targets));
    if (extra.length === 0) return filterWhere(filter);
    const sets = columnSets();
    const t: Record<string, SQL> = { ...targets };
    const decl: Record<string, Filterable[string]> = { ...filterDecl };
    for (const name of extra) {
      const col =
        scopedRead(name) ?? fail(`"${name}" is not a filterable column`);
      t[name] = sql`${col}`;
      const column = sets
        .map((h) => h.wireFilterable[name])
        .find((c) => c !== undefined);
      decl[name] =
        column ?? fail(`"${name}" is not a filterable scoped column`);
    }
    return filterSql(filter, t, decl);
  };
  const where = (params: LiveWindowParams): SQL | undefined => {
    const filter = decode(params).where;
    return allOf([base, ...defaultsFor(filter), tupleFilterWhere(filter)]);
  };
  const orderBy = (params: LiveWindowParams): WindowOrderKey[] =>
    decode(params).orderBy.map(([name, dir]) => {
      const col =
        bound.get(name) ??
        scopedRead(name) ??
        fail(`"${name}" is not a sortable column`);
      return { col, dir, nullable: joins.canBeNull(col) };
    });

  const groupCodec = collection.groups.groups;
  // A group value is a STORED value, so it is checked against the row schema's
  // field — never against the filterable declaration, whose operand narrowing
  // (`liveText(Enum)`) is tsc-only and says nothing about what a column holds.
  const groupSchemas = new Map(ownFilterable.map((n) => [n, fieldSchema(n)]));
  // The wire schema is shared by every column, so this is where a value the row
  // type could never hold (an enum drifted past its schema) fails loudly.
  // Every column a tuple's `where` / grouping may read: the filterable
  // columns, and the base predicate — so each route's columns are exact.
  const filterReads = [
    ...filterable.map((name) => bound.get(name)!),
    ...(base ? [base] : []),
    ...defaults.map((d) => d.where),
  ];
  // A grouping reads the collection's own columns only (its codec knows no
  // contributor).
  const groupReads = [
    ...ownFilterable.map((name) => bound.get(name)!),
    ...(base ? [base] : []),
    ...defaults.map((d) => d.where),
  ];
  const groups = compileGroupsQuery<LiveGroup<FilterScalar>, LiveGroupParams>(
    collection.groups.key,
    {
      from: opts.from,
      ...withJoins,
      hostPk: joins.columnOf(bound.get(collection.id)!),
      reads: groupReads,
      query: (params) => {
        const q = groupCodec.decode(params);
        const schema = groupSchemas.get(q.groupBy)!;
        return {
          column: bound.get(q.groupBy)!,
          where: allOf([base, ...defaultsFor(q.where), filterWhere(q.where)]),
          limit: q.limit,
          check: (value) => {
            if (!schema.safeParse(value).success) {
              fail(
                `group value ${JSON.stringify(value)} of "${q.groupBy}" does not parse ` +
                  `as the row schema's field — the column holds a value the row type cannot.`,
              );
            }
          },
        };
      },
      ...withDb,
    },
  );

  return {
    window: {
      from: opts.from,
      select,
      ...withJoins,
      where,
      whereReads: filterReads,
      orderBy,
      // Every sortable column — a joined one too — as the universe each
      // tuple's order signature is cut from: an UPDATE to a column a tuple
      // sorts by (a side-table write included) re-derives that tuple's window,
      // and costs a tuple sorting by another column no ids query.
      signatureColumns: sortable.map((name) => bound.get(name)!),
      // maxLimit comes from the declaration's codec; the limit is decoded
      // with the served column sets, like every other part of the tuple — and
      // so is the params gate: the descriptor's own decode knows no
      // contributed or scoped column, and would refuse a tuple naming one.
      window: {
        limitOf: (params: LiveWindowParams) => decode(params).limit,
        validateParams: (params) => {
          codec.decode(params, columnSets());
        },
      },
      ...(isContributed ? { readField } : {}),
      // The scoped sets' families: members joined per tuple, one route per
      // set, the members a tuple orders by projected under `$scoped`; and the
      // external value tuples that move a scope's members.
      ...(scope !== null && families.length > 0
        ? {
            families: { joins: families, valuesKey: LIVE_SCOPED_KEY },
            recomputeOn: scoped.map((set) => set.recomputeOn(scope)),
          }
        : {}),
      // A scroll collection's window: segment cuts (decoded strictly by the
      // codec) and each row's server-minted `$key`.
      ...(collection.scroll
        ? {
            scroll: {
              cutsOf: (params: LiveWindowParams) => {
                const { after, until } = decode(params);
                return { after, until };
              },
              keyField: LIVE_ROW_KEY,
              maxKeyBytes: LIVE_ROW_KEY_MAX_BYTES,
            },
          }
        : {}),
      ...withEncode,
      ...withDb,
    },
    rows,
    groups,
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
  const J extends readonly JoinSpec[] = readonly [],
>(
  collection: LiveCollection<Row, F, S>,
  opts: ServeCollectionOptions<T, Row, J, keyof F & string>,
): ServedCollection<Row>;
export function serveCollection<
  Row,
  T extends CollectionSource,
  const J extends readonly JoinSpec[] = readonly [],
>(
  collection: LiveLookupCollection<Row>,
  opts: ServeCollectionOptions<T, Row, J, never>,
): ServedLookupCollection<Row>;
export function serveCollection<
  Row,
  F,
  S extends string,
  T extends CollectionSource,
  const J extends readonly JoinSpec[] = readonly [],
>(
  collection: LiveCollection<Row, F, S> | LiveLookupCollection<Row>,
  opts: ServeCollectionOptions<T, Row, J, keyof F & string>,
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
  if (
    (collection as { contributed?: boolean }).contributed === true ||
    ((collection as { columnScope?: string | null }).columnScope ?? null) !==
      null
  ) {
    return serveContributed(collection, opts);
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

// ── Contributed and scoped collections: compiled at boot ─────────────────
// A `contributed: true` collection's columns come from other plugins'
// `LiveColumns.Serve` contributions, and a `columnScope` collection's scoped
// sets from `LiveColumns.Scoped` ones — both known only once contributions are
// collected. Its three resources are DEFERRED: registered now under their
// descriptors (so `Resource.Declare`, preload and the boot snapshot see them),
// compiled — every contribution naming the collection folded in — at
// `bindDeferredResources`, before anything serves or the change feed rebuilds
// triggers from the route layout.

/** The contributed collections this process serves — what a `LiveColumns.Serve` must name. */
const contributedKeys = new Set<string>();

// A served column set no contributed collection here compiles would never
// reach the wire: its web half would fail every decode instead. Fail boot.
onDeferredResourcesBound(() => {
  const orphans = LiveColumns.Serve.getContributions().filter(
    (s) =>
      s.handle.collection === null || !contributedKeys.has(s.handle.collection),
  );
  if (orphans.length > 0) {
    throw new Error(
      `[live] ${orphans.length} LiveColumns.Serve contribution(s) name a collection no \`serveCollection\` serves here: ` +
        orphans
          .map(
            (s) =>
              `"${s.handle.collection}" ← "${s.handle.name}" (${s._pluginId ?? "?"})`,
          )
          .join(", ") +
        ". Serve the contributed collection (declared `contributed: true`), or drop the contribution.",
    );
  }
});

function serveContributed<
  Row,
  F,
  S extends string,
  T extends CollectionSource,
  const J extends readonly JoinSpec[],
>(
  collection: LiveCollection<Row, F, S>,
  opts: ServeCollectionOptions<T, Row, J, keyof F & string>,
): ServedCollection<Row> {
  if (collection.contributed) contributedKeys.add(collection.key);
  // Compiled once, at the first bind, from every contribution naming it.
  let specs: CollectionSpecs | undefined;
  const compiled = (): CollectionSpecs =>
    (specs ??= compileCollection(
      collection,
      opts,
      LiveColumns.Serve.getContributions().filter(
        (s) => s.handle.collection === collection.key,
      ),
      collection.columnScope === null
        ? []
        : LiveColumns.Scoped.getContributions(),
    ));
  const window = deferredWindowQueryResource(
    collection.window,
    () => compiled().window,
  );
  const rows = deferredWindowQueryResource(
    collection.rows,
    () => compiled().rows,
  );
  const groups = defineDeferredResource(
    collection.groups,
    () => compiled().groups,
  );
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

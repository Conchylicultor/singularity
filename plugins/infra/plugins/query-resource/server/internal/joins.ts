import {
  and,
  Column,
  eq,
  getTableColumns,
  getTableName,
  is,
  Name,
  Param,
  Placeholder,
  sql,
  SQL,
  StringChunk,
  Subquery,
  Table,
  View,
} from "drizzle-orm";
import {
  alias as aliasTable,
  getTableConfig,
  type PgColumn,
  type PgTable,
} from "drizzle-orm/pg-core";
import {
  BASE_RELATION,
  familyMember,
  type ColumnRef,
  type JoinFamily,
  type JoinSpec,
  type KeyedSideJoin,
} from "@plugins/infra/plugins/query-resource/core";
import type {
  HostMap,
  Route,
} from "@plugins/framework/plugins/resource-runtime/core";
import { tablePrimary, type RoutedBase } from "./routes";
import type { QueryDb, QueryStep, SelectMap } from "./spec";

// The server half of the join vocabulary (`core/internal/joins.ts`): renders a
// compile's declared joins, checks them (A4 of
// research/2026-09-29-global-scoped-change-routing.md), and answers the one
// question every routed shape asks of a SQL fragment — WHICH relations does it
// read? That answer is read off the rendered drizzle SQL itself (the columns
// and tables it embeds), never declared beside it, so a tuple's read-set and
// the SQL it runs cannot disagree:
//
// - a join's columns render against its ALIAS (`"playback"."last_played_at"`),
//   the base table's against its own name, so every column chunk names its
//   relation;
// - a relation the fragment reads that is neither the base nor a declared join
//   throws — a table a routed compile reads must be one it routes (the runtime's
//   drift guard, A8, catches only what a load actually captured).
//
// Raw SQL text (`sql.raw`) carries no column objects and is invisible here; a
// routed compile's SQL is built from drizzle columns.

/**
 * A column as a compiled query reads it: a column of the base or of a join's
 * alias — or, for an EXTENSION column with a literal default,
 * `COALESCE("alias"."col", <default>)`. An extension row that does not exist
 * means its declared defaults (entity-extensions' semantics), so a host with no
 * side row reads the default — in a filter, a sort and a projection alike —
 * never a NULL the extension would never have stored. Provenance is unchanged:
 * the expression still names the alias column.
 */
export type ReadColumn = PgColumn | SQL;

/**
 * Every read EXPRESSION a plan rendered → the alias column it reads, whether it
 * can be NULL, and its SQL type: a defaulted extension column's COALESCE (never
 * NULL, the column's own type), and a family member's cast value (NULL for a
 * host with no member row, the cast's type). Module-level, not per plan: a
 * compile renders its columns through one plan and hands them to another
 * (`serveCollection` → `compileWindowQuery`), which must still know what each
 * expression reads.
 */
const readExpressions = new WeakMap<
  SQL,
  { col: PgColumn; nullable: boolean; sqlType: string }
>();

/**
 * Each family's members by alias, as any plan rendered them — module-level for
 * the same reason as `readExpressions`: the plan that applies a tuple's joins
 * finds a member another plan rendered by its alias.
 */
const familyAliases = new WeakMap<JoinFamily, Map<string, string>>();

/** How a family member's value is read: a cast of the raw column, and the SQL type it produces. */
export interface MemberRead {
  cast: (value: PgColumn) => SQL;
  sqlType: string;
}

/** One declared join, rendered. */
export interface CompiledJoin {
  spec: JoinSpec;
  alias: string;
  /** The joined table under its alias: what the SQL joins. */
  rendered: PgTable;
  /** INNER (a required lookup) — a missing joined row drops the host row. */
  inner: boolean;
  /** The join this one hangs off (a chained lookup); `null` = the base table. */
  parent: string | null;
  /** The rendered join condition. */
  on: SQL;
}

/** A relation ("base" or a join alias) and a column of it, by DB name. */
export type RelationColumn = readonly [relation: string, column: string];

export interface JoinPlan {
  /** The base table's SQL name — how its columns render. */
  readonly baseName: string;
  readonly joins: readonly CompiledJoin[];
  /** The INNER joins: every tuple reads them, as membership. */
  readonly required: ReadonlySet<string>;
  /** Render a `ColumnRef` as the column the SQL reads (A4-checked) — see `ReadColumn`. */
  render(ref: ColumnRef): ReadColumn;
  /**
   * Every relation's columns, rendered against their relation (`JoinColumns`):
   * what a static predicate over the joins is written with. These are the raw
   * columns — a predicate over a defaulted extension column states its own
   * NULL handling.
   */
  columns(): Readonly<Record<string, Readonly<Record<string, PgColumn>>>>;
  /** The relation a rendered column belongs to; throws for an undeclared one. */
  relationOf(col: ReadColumn): string;
  /** The column a rendered one reads: itself, or the alias column a defaulted one coalesces. */
  columnOf(col: ReadColumn): PgColumn;
  /**
   * Whether a rendered column can read NULL: a nullable column, or one a LEFT
   * join (its own or an ancestor's) may leave NULL — never a defaulted
   * extension column, which reads its default instead.
   */
  canBeNull(col: ReadColumn): boolean;
  /** Every (relation, column) a SQL fragment, a column, or a projection reads. */
  columnsIn(fragment: unknown): RelationColumn[];
  /** The relations a fragment reads (see `columnsIn`), the base included. */
  relationsIn(fragment: unknown): Set<string>;
  /** The joins among `seeds`, plus every join they hang off. */
  closure(seeds: Iterable<string>): Set<string>;
  /** Whether a relation's columns may read NULL through a LEFT join (its own or an ancestor's). */
  outer(relation: string): boolean;
  /** Apply the `included` joins to a query, in declaration order (family members after, by alias). */
  apply<Row>(q: QueryStep<Row>, included: ReadonlySet<string>): QueryStep<Row>;
  /** Every (relation, column) the join conditions read. */
  readonly conditionColumns: readonly RelationColumn[];
  /** The join families this plan may render members of. */
  readonly families: readonly JoinFamily[];
  /**
   * A family member's value, rendered against the member's alias (its join is
   * compiled on first use): the raw column, or `read`'s cast of it — an
   * expression that reads NULL for a host with no member row.
   */
  readMember(familyId: string, member: string, read?: MemberRead): ReadColumn;
  /** The family and member a relation is, when it is a family member's alias. */
  familyOf(
    relation: string,
  ): { family: JoinFamily; member: string } | undefined;
  /** The SQL type a rendered column reads as (a cast expression's own). */
  sqlTypeOf(col: ReadColumn): string;
}

/**
 * The `j` of a `(j) => ColumnRef` override: `j.base.x` over `baseColumns` (the
 * base source's wire columns), `j.<alias>.x` over each join's wire columns
 * (`wireColumns`, else every column of its table) — one `ColumnRef` per column,
 * so a server-only column is not offered. Data only — `compileJoins` checks
 * what a ref names when it renders it.
 */
export function joinRefs(
  baseColumns: Readonly<Record<string, PgColumn>>,
  specs: readonly JoinSpec[],
): Readonly<Record<string, Readonly<Record<string, ColumnRef>>>> {
  const refsOf = (from: string, columns: Readonly<Record<string, PgColumn>>) =>
    Object.fromEntries(
      Object.entries(columns).map(([k, col]) => [
        k,
        { from, col } satisfies ColumnRef,
      ]),
    );
  return {
    [BASE_RELATION]: refsOf(BASE_RELATION, baseColumns),
    ...Object.fromEntries(
      specs.map((j) => [
        j.alias,
        refsOf(
          j.alias,
          j.wireColumns ??
            (getTableColumns(j.table) as Record<string, PgColumn>),
        ),
      ]),
    ),
  };
}

// drizzle marks an aliased table with this registered symbol (`alias()`); its
// typings do not expose `Table.Symbol`, so it is read by its registered name.
const IS_ALIAS = Symbol.for("drizzle:IsAlias");

/** Whether a column is rendered against a join's alias (not a base / plain table column). */
function isJoinedColumn(col: Column): boolean {
  return (col.table as unknown as Record<symbol, unknown>)[IS_ALIAS] === true;
}

/** Whether two rendered columns are the same column of the same relation (a defaulted one: the same expression). */
export function sameColumn(a: ReadColumn, b: ReadColumn): boolean {
  if (a === b) return true;
  if (is(a, SQL) || is(b, SQL)) return false;
  const x = a as PgColumn;
  const y = b as PgColumn;
  return x.name === y.name && getTableName(x.table) === getTableName(y.table);
}

/**
 * An extension column's literal default (a number, boolean or string its
 * meta declares — drizzle's `.default(value)`), or `undefined`: none, or a
 * computed one (`defaultNow()`, SQL) that no reader can stand in for.
 */
function literalDefault(col: PgColumn): string | number | boolean | undefined {
  if (!col.hasDefault) return undefined;
  const value: unknown = col.default;
  return typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string"
    ? value
    : undefined;
}

/**
 * The key of `select` projecting `col` (same relation, same column), or
 * undefined. A join column never matches a base column of the same name.
 */
export function projectedField(
  select: SelectMap,
  col: ReadColumn,
): string | undefined {
  for (const [key, value] of Object.entries(select)) {
    if (value === col) return key;
    if (is(value, Column) && sameColumn(value as PgColumn, col)) return key;
  }
  return undefined;
}

/**
 * Render and check a compile's joins. `hostPk` is the compiled resource's
 * identity column (a keyed window / point), or undefined for a non-keyed
 * grouping — whose routes are all `full`, so no join maps to host ids.
 * Every misuse throws here, at module eval.
 */
export function compileJoins(
  base: RoutedBase,
  specs: readonly JoinSpec[],
  hostPk: PgColumn | undefined,
  label: string,
  families: readonly JoinFamily[] = [],
): JoinPlan {
  const fail = (message: string): never => {
    throw new Error(`${label}: ${message}`);
  };
  const baseName = base.name;
  const byAlias = new Map<string, CompiledJoin>();
  const joins: CompiledJoin[] = [];
  // Rendered columns, one object per (relation, column): drizzle's alias proxy
  // mints a fresh column on every property read.
  const renderedCache = new Map<string, PgColumn>();
  // A defaulted extension column's COALESCE, one object per (relation,
  // column) too (the alias column it reads: `readExpressions`).
  const defaultedCache = new Map<string, SQL>();
  const renderRaw = (join: CompiledJoin, key: string): PgColumn => {
    const cacheKey = `${join.alias}\u0000${key}`;
    let col = renderedCache.get(cacheKey);
    if (col === undefined) {
      col = (join.rendered as unknown as Record<string, PgColumn>)[key]!;
      renderedCache.set(cacheKey, col);
    }
    return col;
  };

  const keyOf = (table: PgTable, col: PgColumn): string | undefined =>
    Object.entries(getTableColumns(table) as Record<string, PgColumn>).find(
      ([, c]) => c === col,
    )?.[0];

  const render = (ref: ColumnRef): ReadColumn => {
    if (ref.from === BASE_RELATION) {
      if (ref.col.table !== base.table) {
        fail(
          `column "${ref.col.name}" is not a column of the base table "${baseName}" — a base ColumnRef names the base table's own column (A4).`,
        );
      }
      return ref.col;
    }
    const join = byAlias.get(ref.from);
    if (join === undefined) {
      return fail(
        `ColumnRef names relation "${ref.from}", which is neither the base nor a join declared before it — declare the join (A4).`,
      );
    }
    const key = keyOf(join.spec.table, ref.col);
    if (key === undefined) {
      return fail(
        `column "${ref.col.name}" is not a column of join "${ref.from}" (table "${getTableName(join.spec.table)}") (A4).`,
      );
    }
    const col = renderRaw(join, key);
    const fallback =
      join.spec.kind === "extension" ? literalDefault(ref.col) : undefined;
    if (fallback === undefined) return col;
    const cacheKey = `${ref.from}\u0000${key}`;
    let expr = defaultedCache.get(cacheKey);
    if (expr === undefined) {
      expr = sql`COALESCE(${col}, ${sql.param(fallback, col)})`.mapWith(col);
      defaultedCache.set(cacheKey, expr);
      readExpressions.set(expr, {
        col,
        nullable: false,
        sqlType: col.getSQLType(),
      });
    }
    return expr;
  };

  // A join condition compares stored keys: the raw column, never a default.
  const rawRender = (ref: ColumnRef): PgColumn => {
    const rendered = render(ref);
    return is(rendered, SQL) ? readExpressions.get(rendered)!.col : rendered;
  };

  const expressionOf = (col: SQL) => {
    const known = readExpressions.get(col);
    if (known === undefined) {
      return fail(
        "a SQL expression is not one of this compile's rendered columns — render a ColumnRef through the plan.",
      );
    }
    return known;
  };

  const columnOf = (col: ReadColumn): PgColumn =>
    is(col, SQL) ? expressionOf(col).col : col;

  const primaryOf = (table: PgTable): PgColumn | null => tablePrimary(table);

  const hostCol = (): PgColumn =>
    hostPk ??
    fail(
      "a keyed-side join matches the host's identity, and this compile has none.",
    );

  for (const spec of specs) {
    const { alias } = spec;
    if (alias === BASE_RELATION || alias === baseName) {
      fail(
        `join alias "${alias}" is reserved — it names the base table. Pick another.`,
      );
    }
    if (byAlias.has(alias)) fail(`duplicate join alias "${alias}".`);
    const rendered = aliasTable(spec.table, alias) as PgTable;
    const pending: CompiledJoin = {
      spec,
      alias,
      rendered,
      inner: spec.kind === "lookup" && spec.required,
      parent: null,
      on: undefined as unknown as SQL,
    };
    // Registered before its condition renders, so the join's own columns
    // resolve; `on` of a lookup may only name an EARLIER relation (checked
    // below).
    byAlias.set(alias, pending);
    const own = (col: PgColumn, role: string): PgColumn => {
      const key = keyOf(spec.table, col);
      if (key === undefined) {
        return fail(
          `join "${alias}": its ${role} "${col.name}" is not a column of table "${getTableName(spec.table)}" (A4).`,
        );
      }
      return renderRaw(pending, key);
    };
    switch (spec.kind) {
      case "extension": {
        if (spec.parentKey.table !== base.table) {
          fail(
            `extension join "${alias}" hangs off table "${getTableName(spec.parentKey.table)}", not the base "${baseName}" — an extension is joined onto its own parent (A4).`,
          );
        }
        if (primaryOf(spec.table) !== spec.key) {
          fail(
            `extension join "${alias}": its key "${spec.key.name}" is not the single-column primary key of "${getTableName(spec.table)}" — an extension is 1:1 with its host (A4).`,
          );
        }
        if (hostPk !== undefined && hostPk !== spec.parentKey) {
          fail(
            `extension join "${alias}" is keyed by "${spec.parentKey.name}", but this resource's identity is "${hostPk.name}" — a side row's key must BE the host id it refills.`,
          );
        }
        pending.on = eq(own(spec.key, "key"), spec.parentKey);
        break;
      }
      case "lookup": {
        if (spec.on.from !== BASE_RELATION && !byAlias.has(spec.on.from)) {
          fail(
            `lookup join "${alias}": its \`on\` names "${spec.on.from}", which is not the base or a join declared before it (A4).`,
          );
        }
        if (spec.on.from === alias) {
          fail(
            `lookup join "${alias}": its \`on\` names the join itself (A4).`,
          );
        }
        if (primaryOf(spec.table) !== spec.pk && !spec.pk.isUnique) {
          fail(
            `lookup join "${alias}": "${spec.pk.name}" is neither the primary key nor unique in "${getTableName(spec.table)}" — an N:1 lookup would multiply host rows (A4).`,
          );
        }
        pending.parent = spec.on.from === BASE_RELATION ? null : spec.on.from;
        pending.on = eq(own(spec.pk, "pk"), rawRender(spec.on));
        break;
      }
      case "keyed-side":
        pending.on = keyedSideOn(spec, own);
        break;
    }
    joins.push(pending);
  }

  // The host key a keyed side stores is compared as the side column's type
  // (a custom value's `row_key` is text, whatever the host id's type).
  function hostKeyed(hostKey: PgColumn): PgColumn | SQL {
    const host = hostCol();
    return host.getSQLType() === hostKey.getSQLType()
      ? host
      : sql`${host}::${sql.raw(hostKey.getSQLType())}`;
  }

  function keyedSideOn(
    spec: KeyedSideJoin,
    own: (col: PgColumn, role: string) => PgColumn,
  ): SQL {
    const covered = new Set<string>([
      spec.hostKey.name,
      ...spec.selectors.map((s) => s.col.name),
    ]);
    const missing = primaryColumns(spec.table).filter(
      (c) => !covered.has(c.name),
    );
    if (missing.length > 0) {
      fail(
        `keyed-side join "${spec.alias}": its selectors and hostKey leave primary-key column(s) ${missing.map((c) => `"${c.name}"`).join(", ")} of "${getTableName(spec.table)}" open — the join would multiply host rows (A4).`,
      );
    }
    return and(
      eq(own(spec.hostKey, "hostKey"), hostKeyed(spec.hostKey)),
      ...spec.selectors.map((s) => eq(own(s.col, "selector"), s.value)),
    )!;
  }

  // ── Join families: members compiled on first use ─────────────────────────
  const familyById = new Map<string, JoinFamily>();
  for (const family of families) {
    if (
      family.id === BASE_RELATION ||
      family.id === baseName ||
      byAlias.has(family.id) ||
      familyById.has(family.id)
    ) {
      fail(
        `join family "${family.id}" collides with the base, a join or another family — pick another id.`,
      );
    }
    for (const col of [
      family.hostKey,
      family.member,
      family.value,
      ...family.selectors.map((s) => s.col),
    ]) {
      if (col.table !== family.table) {
        fail(
          `join family "${family.id}": column "${col.name}" is not a column of its table "${getTableName(family.table)}" (A4).`,
        );
      }
    }
    familyById.set(family.id, family);
  }
  const memberJoins = new Map<string, CompiledJoin>();
  const memberOfAlias = new Map<
    string,
    { family: JoinFamily; member: string }
  >();
  const memberJoin = (family: JoinFamily, member: string): CompiledJoin => {
    const spec = familyMember(family, member);
    const alias = spec.alias;
    const cached = memberJoins.get(alias);
    if (cached) {
      const owner = memberOfAlias.get(alias)!;
      if (owner.family !== family || owner.member !== member) {
        fail(
          `join family "${family.id}": members "${owner.member}" and "${member}" make the same alias "${alias}".`,
        );
      }
      return cached;
    }
    if (Buffer.byteLength(alias, "utf8") > 63) {
      fail(
        `join family "${family.id}": member "${member}" makes the alias "${alias}", longer than Postgres's 63-byte identifier limit.`,
      );
    }
    if (byAlias.has(alias)) {
      fail(
        `join family "${family.id}": member "${member}"'s alias "${alias}" collides with a declared join.`,
      );
    }
    const rendered = aliasTable(spec.table, alias) as PgTable;
    const join: CompiledJoin = {
      spec,
      alias,
      rendered,
      inner: false,
      parent: null,
      on: undefined as unknown as SQL,
    };
    const own = (col: PgColumn, role: string): PgColumn => {
      const key = keyOf(spec.table, col);
      if (key === undefined) {
        return fail(
          `join family "${family.id}": its ${role} "${col.name}" is not a column of table "${getTableName(spec.table)}" (A4).`,
        );
      }
      return renderRaw(join, key);
    };
    join.on = keyedSideOn(spec, own);
    memberJoins.set(alias, join);
    memberOfAlias.set(alias, { family, member });
    let shared = familyAliases.get(family);
    if (!shared) familyAliases.set(family, (shared = new Map()));
    shared.set(alias, member);
    return join;
  };
  // A member another plan rendered (the same family object), found by alias.
  const joinOfAlias = (name: string): CompiledJoin | undefined => {
    const join = byAlias.get(name) ?? memberJoins.get(name);
    if (join) return join;
    for (const family of familyById.values()) {
      const member = familyAliases.get(family)?.get(name);
      if (member !== undefined) return memberJoin(family, member);
    }
    return undefined;
  };

  const relationOf = (readCol: ReadColumn): string => {
    const col = columnOf(readCol);
    const name = getTableName(col.table);
    const isAlias = isJoinedColumn(col);
    if (!isAlias && name === baseName) return BASE_RELATION;
    if (isAlias && joinOfAlias(name)) return name;
    return fail(
      `the query reads relation "${name}" (column "${col.name}"), which is neither the base table "${baseName}" nor a declared join — declare it as a join, so the table is routed.`,
    );
  };

  const columnsIn = (fragment: unknown): RelationColumn[] => {
    const out: RelationColumn[] = [];
    // Guarded against revisits: a leaf chunk's `getSQL()` wraps itself.
    const seen = new Set<object>();
    const walk = (x: unknown): void => {
      if (x === null || x === undefined || typeof x !== "object") return;
      if (seen.has(x)) return;
      seen.add(x);
      if (is(x, StringChunk) || is(x, Name) || is(x, Placeholder)) return;
      if (Array.isArray(x)) {
        for (const c of x) walk(c);
        return;
      }
      if (is(x, Column)) {
        const col = x as PgColumn;
        out.push([relationOf(col), col.name]);
        return;
      }
      if (is(x, SQL)) {
        for (const c of (x as SQL).queryChunks) walk(c);
        return;
      }
      if (is(x, SQL.Aliased)) {
        walk((x as SQL.Aliased).sql);
        return;
      }
      if (is(x, Param)) return; // a bound value; its encoder is a column already walked
      if (is(x, View)) {
        fail(
          "the query reads a view — a routed compile reads base tables, whose changes its routes can name (A1).",
        );
      }
      if (is(x, Table)) {
        const name = getTableName(x as Table);
        if (name !== baseName && !joinOfAlias(name)) {
          fail(
            `the query reads table "${name}", which is neither the base table "${baseName}" nor a declared join — declare it as a join, so the table is routed.`,
          );
        }
        return;
      }
      if (is(x, Subquery)) {
        walk((x as Subquery)._.sql);
        return;
      }
      const getSQL = (x as { getSQL?: () => unknown }).getSQL;
      if (typeof getSQL === "function") walk(getSQL.call(x));
    };
    walk(fragment);
    return out;
  };

  const relationsIn = (fragment: unknown): Set<string> =>
    new Set(columnsIn(fragment).map(([r]) => r));

  const closure = (seeds: Iterable<string>): Set<string> => {
    const out = new Set<string>();
    for (const seed of seeds) {
      let at: string | null = seed === BASE_RELATION ? null : seed;
      while (at !== null && !out.has(at)) {
        out.add(at);
        at = joinOfAlias(at)!.parent;
      }
    }
    return out;
  };

  const outer = (relation: string): boolean => {
    let at: string | null = relation === BASE_RELATION ? null : relation;
    while (at !== null) {
      const join = joinOfAlias(at)!;
      if (!join.inner) return true;
      at = join.parent;
    }
    return false;
  };

  const required = new Set(joins.filter((j) => j.inner).map((j) => j.alias));
  // An INNER join below a LEFT one: its ancestors are read as membership too
  // (`closure`), since a missing ancestor row drops the host.

  const conditionColumns = joins.flatMap((j) => columnsIn(j.on));

  return {
    baseName,
    joins,
    required,
    render,
    // Every column of every relation — a predicate may read a server-only
    // column, which never reaches the wire.
    columns: () => {
      const rendered = (from: string, table: PgTable) =>
        Object.fromEntries(
          Object.entries(
            getTableColumns(table) as Record<string, PgColumn>,
          ).map(([k, col]) => [k, rawRender({ from, col })]),
        );
      return {
        [BASE_RELATION]: rendered(BASE_RELATION, base.table),
        ...Object.fromEntries(
          specs.map((j) => [j.alias, rendered(j.alias, j.table)]),
        ),
      };
    },
    relationOf,
    columnOf,
    canBeNull: (col) =>
      is(col, SQL)
        ? expressionOf(col).nullable
        : !(col as PgColumn).notNull || outer(relationOf(col)),
    columnsIn,
    relationsIn,
    closure,
    outer,
    apply(q, included) {
      let out = q;
      for (const j of joins) {
        if (!included.has(j.alias)) continue;
        out = j.inner
          ? out.innerJoin(j.rendered, j.on)
          : out.leftJoin(j.rendered, j.on);
      }
      // Family members, in alias order (a stable statement per member set).
      const members = [...included]
        .filter((alias) => !byAlias.has(alias))
        .sort();
      for (const alias of members) {
        const j = joinOfAlias(alias);
        if (j === undefined) {
          fail(
            `the tuple includes relation "${alias}", which no join declares.`,
          );
        }
        out = out.leftJoin(j!.rendered, j!.on);
      }
      return out;
    },
    conditionColumns,
    families,
    readMember(familyId, member, read) {
      const family =
        familyById.get(familyId) ??
        fail(`no join family "${familyId}" is declared on this compile.`);
      const join = memberJoin(family, member);
      const key = keyOf(family.table, family.value)!;
      const raw = renderRaw(join, key);
      if (read === undefined) return raw;
      const cacheKey = `${join.alias}\u0000${key}\u0000${read.sqlType}`;
      let expr = defaultedCache.get(cacheKey);
      if (expr === undefined) {
        expr = read.cast(raw);
        defaultedCache.set(cacheKey, expr);
        readExpressions.set(expr, {
          col: raw,
          nullable: true,
          sqlType: read.sqlType,
        });
      }
      return expr;
    },
    familyOf(relation) {
      if (byAlias.has(relation) || relation === BASE_RELATION) return undefined;
      return joinOfAlias(relation) === undefined
        ? undefined
        : memberOfAlias.get(relation);
    },
    sqlTypeOf: (col) =>
      is(col, SQL) ? expressionOf(col).sqlType : (col as PgColumn).getSQLType(),
  };
}

// Every primary-key column of a table (compared by name — a table-level
// declaration's columns are not the table's own objects): a table-level
// declaration (`primaryKey({ columns })`), else the inline `.primaryKey()`
// columns.
function primaryColumns(table: PgTable): PgColumn[] {
  const declared = getTableConfig(table).primaryKeys[0];
  if (declared) return declared.columns;
  return Object.values(
    getTableColumns(table) as Record<string, PgColumn>,
  ).filter((c) => c.primary);
}

/**
 * `col = ANY($1::<type>[])` over text values: ONE array param whatever the
 * count, each value cast back to the column's own type — so Postgres compares
 * the key it stored and the column's index serves the probe.
 */
function anyOf(col: PgColumn, values: readonly string[]): SQL {
  return sql`${col} = ANY(${sql.param([...values])}::${sql.raw(col.getSQLType())}[])`;
}

/** What a keyed compile's join routes are resolved against: the host and the plan. */
export interface JoinRouteHost {
  /** The base table's routed name and table — what a reverse query reads the hosts from. */
  base: RoutedBase;
  /** The host's identity column: its values are the host ids. */
  pk: PgColumn;
  plan: JoinPlan;
  db: QueryDb;
}

/**
 * A lookup's `reverse` route map (the host side references the looked-up row):
 * the changed rows' `pk` values are resolved, in the drain, to the hosts whose
 * `on` column names one — `SELECT DISTINCT <host pk> FROM <base> [the lookup
 * chain up to \`on\`'s relation] WHERE on = ANY($changed) [AND pk = ANY($within)]
 * LIMIT cap + 1`, `"over-cap"` past the cap.
 *
 * Complete after commit by the FK-direction rule (A10 of
 * research/2026-09-29-global-scoped-change-routing.md): the referencing column
 * lives on HOST-side rows — the base, or an earlier join of the chain — which
 * still hold it whatever happened to the looked-up row (`events WHERE
 * source_id = ANY($changed)` finds a deleted source's events). A chain whose
 * hop reads the CHANGED table itself (an earlier join over the same table)
 * would read the post-image of the very rows that changed, and needs their
 * pre-image, which no layout carries for it: that route is `full`, with the
 * reason.
 */
function reverseMap(join: CompiledJoin, host: JoinRouteHost): HostMap {
  const spec = join.spec;
  if (spec.kind !== "lookup") {
    throw new Error(`reverseMap: join "${join.alias}" is not a lookup`);
  }
  const { plan, db, pk, base } = host;
  const table = getTableName(spec.table);
  // The joins the probe reads: the relation `on` belongs to and its ancestors.
  const chain =
    spec.on.from === BASE_RELATION
      ? new Set<string>()
      : plan.closure([spec.on.from]);
  for (const alias of chain) {
    const hop = plan.joins.find((j) => j.alias === alias)!;
    if (getTableName(hop.spec.table) === table) {
      return {
        kind: "full",
        reason: `pre-image needed: lookup "${join.alias}" is reached through "${alias}", a join over the changed table "${table}" itself — resolved after commit, the probe would read the rows that changed (A10)`,
      };
    }
  }
  const on = plan.columnOf(plan.render(spec.on));
  return {
    kind: "reverse",
    column: spec.pk.name,
    resolve: async (changed, within, cap) => {
      if (changed.length === 0 || (within !== null && within.size === 0)) {
        return [];
      }
      const probe = anyOf(on, changed);
      const rows = await plan
        .apply(
          db.selectDistinct<{ id: unknown }>({ id: pk }).from(base.table),
          chain,
        )
        .where(within === null ? probe : and(probe, anyOf(pk, [...within]))!)
        .limit(cap + 1);
      return rows.length > cap ? "over-cap" : rows.map((r) => String(r.id));
    },
  };
}

/** The route of one join, for a keyed (routed) compile — see `JoinSpec`. */
export function joinRoute(
  join: CompiledJoin,
  host: JoinRouteHost,
  columns: readonly string[],
): Route {
  const spec = join.spec;
  const base = { id: join.alias, table: getTableName(spec.table), columns };
  switch (spec.kind) {
    case "extension":
      // The key IS the side table's primary key (checked): its ids are host ids.
      return { ...base, map: { kind: "alias" } };
    case "lookup": {
      if (spec.on.from === BASE_RELATION && spec.on.col === host.pk) {
        // Keyed by the host's own id: an extension in all but name.
        return {
          ...base,
          map:
            tablePrimary(spec.table) === spec.pk
              ? { kind: "alias" }
              : { kind: "alias", column: spec.pk.name },
        };
      }
      // The host side references it: resolved in the drain (see `reverseMap`).
      return { ...base, map: reverseMap(join, host) };
    }
    case "keyed-side":
      return {
        ...base,
        map: { kind: "alias", column: spec.hostKey.name },
        rows: Object.fromEntries(
          spec.selectors.map((s) => [s.col.name, s.value]),
        ),
      };
  }
}

/**
 * The one route of a join family: an `alias` on its host key, kept to its
 * scope's rows (`rows` = the selectors) and, per tuple, to the members it reads
 * (`match` on the member column). Its `columns` are the ones every member's
 * join and read touch: the key columns and the value.
 */
export function familyRoute(family: JoinFamily): Route {
  const read = new Set<string>([
    family.hostKey.name,
    family.member.name,
    family.value.name,
    ...family.selectors.map((s) => s.col.name),
  ]);
  return {
    id: family.id,
    table: getTableName(family.table),
    map: { kind: "alias", column: family.hostKey.name },
    rows: Object.fromEntries(
      family.selectors.map((s) => [s.col.name, s.value]),
    ),
    match: [family.member.name],
    columns: Object.values(
      getTableColumns(family.table) as Record<string, PgColumn>,
    )
      .map((c) => c.name)
      .filter((c) => read.has(c)),
  };
}

/**
 * Each relation's route `columns`: every column of it the compiled SQL may
 * reference, over every tuple — `reads` (projection, identity, join conditions,
 * a static `where`, the declared per-params `where` columns, the order
 * signature). `open` — a per-params `where` whose columns nobody declared — makes
 * it every column of every relation, the safe over-approximation (the
 * `unchanged` gate then never skips).
 */
export function routeColumnsOf(
  plan: JoinPlan,
  base: RoutedBase,
  reads: readonly RelationColumn[],
  open: boolean,
): (relation: string) => string[] {
  const tableOf = (relation: string): PgTable =>
    relation === BASE_RELATION
      ? base.table
      : plan.joins.find((j) => j.alias === relation)!.spec.table;
  const byRelation = new Map<string, Set<string>>();
  for (const [relation, column] of [...reads, ...plan.conditionColumns]) {
    let set = byRelation.get(relation);
    if (!set) byRelation.set(relation, (set = new Set()));
    set.add(column);
  }
  return (relation) => {
    // Table order, so a plan's routes are stable to read.
    const all = Object.values(
      getTableColumns(tableOf(relation)) as Record<string, PgColumn>,
    ).map((c) => c.name);
    if (open) return all;
    const set = byRelation.get(relation) ?? new Set<string>();
    return all.filter((c) => set.has(c));
  };
}

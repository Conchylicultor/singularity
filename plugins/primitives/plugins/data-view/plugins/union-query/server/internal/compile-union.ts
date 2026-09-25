import { and, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  testClause,
  type Filter,
  type FilterClause,
} from "@plugins/network/plugins/live/plugins/filter/core";
import {
  compileWhere,
  type FieldColumnMap,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import {
  buildSortKeys,
  orderByClauses,
  seekPredicate,
  type ColumnExpr,
  type SortKey,
} from "@plugins/primitives/plugins/keyset/server";
import {
  decodeCursor,
  sortSignature,
  type KeysetSortRule,
} from "@plugins/primitives/plugins/keyset/core";
import {
  DEFAULT_UNION_DISCRIMINATOR,
  unionFilterable,
  UnionCursorMismatchError,
  type UnionColumnSpec,
  type UnionColumnSpecs,
  type UnionDiscriminator,
} from "../../core";

/**
 * One contributor to the merged row space: a table, the discriminator value its
 * rows carry, and where each projected column comes from.
 *
 * A `null` binding means **this arm has no such notion** — the compiler projects
 * a typed NULL for it. That is the honest reading (`backup_runs` has no
 * namespace) and it is also what keeps `UNION ALL` type-checking, since the
 * compiler owns the cast rather than each arm remembering one.
 */
export interface UnionArm {
  /** The discriminator value stamped onto every row of this arm. */
  kind: string;
  table: PgTable;
  /** Base column id → this arm's expression, or `null` for "no such notion". */
  base: Record<string, ColumnExpr | null>;
  /** Arm column id → this arm's expression. Ids this arm does not own are absent. */
  extra: Record<string, ColumnExpr | null>;
  /** Always-on scope for this arm (soft-delete, retention window, …). */
  where?: SQL;
}

export interface CompileUnionPageArgs {
  arms: UnionArm[];
  /** Columns EVERY arm projects. Iteration order is the projection order. */
  base: UnionColumnSpecs;
  /** Columns ONE arm projects; NULL on every other arm. Ids must be globally unique. */
  extra: UnionColumnSpecs;
  /** The discriminator column. Defaults to {@link DEFAULT_UNION_DISCRIMINATOR} (`kind`, text). */
  discriminator?: UnionDiscriminator;
  /** The base column that is each arm's own row identity — the keyset's last key. */
  tiebreaker: { fieldId: string };
  sort: KeysetSortRule[];
  /**
   * The DECODED filter (the handler ran `decodeFilterBody` against
   * `unionFilterable(base, extra, discriminator)`), search included — the
   * DataView host lowers the search box into it. `undefined` = no filter.
   */
  filter: Filter | undefined;
  cursor: string | null;
  /** Rows to fetch. Pass `pageSize + 1` — the caller detects `hasMore` from the extra row. */
  limit: number;
}

export interface CompiledUnionPage {
  /** The whole page as one statement — run it with `executeRows`. */
  sql: SQL;
  /**
   * The ordering keys, in key order. `keyValuesOf(row, keys)` reads the cursor
   * tuple straight off a result row, because every projected alias IS its column id.
   */
  keys: SortKey[];
  /** Arms a filter rule excluded outright, by `kind`. Informational. */
  prunedArms: string[];
  /** The signature to stamp into the next cursor (`encodeCursor(values, sig)`). */
  sortSignature: string;
}

/** The alias the union subquery is exposed under, and what the outer ORDER BY reads. */
const OUTER_ALIAS = "u";

/** A projected alias is a bare identifier plus dots (`build.targets`) — nothing quotable-out-of. */
const ID_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;
/** A Postgres type name, optionally an array of one (`text`, `double precision`, `text[]`). */
const SQL_TYPE_RE = /^[A-Za-z][A-Za-z0-9_ ]*(\[\])?$/;

/** `"foo"` as a raw SQL chunk. Only ever called on an id `assertId` has cleared. */
function ident(id: string): SQL {
  return sql.raw(`"${id}"`);
}

function assertId(id: string): void {
  if (!ID_RE.test(id)) {
    throw new Error(
      `[union-query] column id "${id}" is not a bare identifier (${ID_RE.source}). ` +
        `Ids become quoted SQL aliases, so anything else would be an injection seam.`,
    );
  }
}

function assertSqlType(id: string, spec: UnionColumnSpec): void {
  if (!SQL_TYPE_RE.test(spec.sqlType)) {
    throw new Error(
      `[union-query] column "${id}" declares sqlType "${spec.sqlType}", which is not a ` +
        `Postgres type name (${SQL_TYPE_RE.source}). It is interpolated raw into a NULL cast.`,
    );
  }
}

/**
 * The clauses that hold **unconditionally** over the whole result — reachable
 * from the root through AND groups only.
 *
 * Only those may prune an arm. A clause inside an OR is one alternative among
 * several, so a row that fails it can still be returned; pruning on it would
 * delete rows the filter admits.
 */
function conjunctiveClauses(filter: Filter | undefined): FilterClause[] {
  const out: FilterClause[] = [];
  const walk = (f: Filter): void => {
    if ("and" in f) f.and.forEach(walk);
    else if (!("or" in f)) out.push(f);
  };
  if (filter !== undefined) walk(filter);
  return out;
}

/** This arm's expression for `id`, or `null` when it does not own it. */
function bindingFor(
  arm: UnionArm,
  id: string,
  isBase: boolean,
): ColumnExpr | null {
  const map = isBase ? arm.base : arm.extra;
  return map[id] ?? null;
}

/**
 * Compile one keyset page over N tables merged into a single ordered row space.
 *
 * The shape is a `UNION ALL` of one seeked, ordered, limited subselect per arm,
 * re-ordered and re-limited on the outside:
 *
 * ```sql
 * SELECT * FROM (
 *     (SELECT 'build'::text AS "kind", … FROM build_runs  WHERE … ORDER BY … LIMIT $n)
 *   UNION ALL
 *     (SELECT 'backup'::text AS "kind", … FROM backup_runs WHERE … ORDER BY … LIMIT $n)
 * ) AS "u" ORDER BY … LIMIT $n
 * ```
 *
 * Everything the query knows is pushed **into** each arm — the compiled filter,
 * the keyset seek and the limit — so each arm reads at most `limit` rows off its
 * own `(sort key, id)` index and Postgres merges the sorted prefixes. Nothing
 * scans a whole ledger to throw most of it away outside.
 *
 * Three rules make the merge well-defined; each is a test in the suite beside
 * this file:
 *
 * - **Arm pruning.** A conjunctive clause over a column that is a CONSTANT in
 *   an arm — a typed NULL (the arm has no such notion) or the discriminator —
 *   is evaluated once in memory; if it fails, the arm leaves the union
 *   outright. `build.targets hasAll [sonata]` therefore yields builds only, and
 *   gets *cheaper*. A negative op keeps the arm, because NULL satisfies it:
 *   under the filter language's complement semantics `build.targets hasNone
 *   [sonata]` is TRUE for every backup row.
 * - **Null projection alignment.** Every arm projects the same ordered column
 *   list; a column it does not own is `NULL::<sqlType>`. The cast is the
 *   compiler's, not the arm's, so `UNION ALL` type-checks by construction.
 * - **Symmetric nullability.** A column is treated as nullable everywhere as soon
 *   as ONE surviving arm nulls it, so the `NULLS LAST` ordering and the seek's
 *   `OR col IS NULL` terms agree across the whole union rather than per arm.
 *
 * When every arm is pruned (or none was registered) the result is a `SELECT …
 * WHERE false` scaffold with the full projection: one code path, valid SQL, and
 * an empty page — which is the true answer, not an absorbed failure.
 */
export function compileUnionPage(
  args: CompileUnionPageArgs,
): CompiledUnionPage {
  const {
    arms,
    base,
    extra,
    discriminator = DEFAULT_UNION_DISCRIMINATOR,
    tiebreaker,
    sort,
    filter,
    cursor,
    limit,
  } = args;

  // ---- shape validation -------------------------------------------------
  const baseIds = Object.keys(base);
  const extraIds = Object.keys(extra);
  assertId(discriminator.fieldId);
  for (const id of baseIds) {
    assertId(id);
    assertSqlType(id, base[id]!);
  }
  for (const id of extraIds) {
    assertId(id);
    assertSqlType(id, extra[id]!);
  }
  if (discriminator.fieldId in base || discriminator.fieldId in extra) {
    throw new Error(
      `[union-query] the discriminator "${discriminator.fieldId}" is projected by the compiler ` +
        `from each arm's \`kind\`; it must not also be declared as a column.`,
    );
  }
  if (
    !(tiebreaker.fieldId in base) ||
    base[tiebreaker.fieldId]!.domain === null
  ) {
    throw new Error(
      `[union-query] tiebreaker "${tiebreaker.fieldId}" must be a BASE column with a domain — every ` +
        `arm has to carry an orderable row identity or the keyset seek has no total order.`,
    );
  }
  for (const id of extraIds) {
    if (id in base) {
      throw new Error(
        `[union-query] "${id}" is declared as both a base and an arm column.`,
      );
    }
  }

  // Projection order, identical in every arm. The discriminator leads so a
  // rendered statement reads as what it is.
  const columnOrder = [discriminator.fieldId, ...baseIds, ...extraIds];
  const specOf = (id: string): UnionColumnSpec =>
    id === discriminator.fieldId
      ? { domain: discriminator.domain, sqlType: "text" }
      : (base[id] ?? extra[id]!);
  const isBaseId = (id: string): boolean => id in base;

  // ---- arm pruning ------------------------------------------------------
  // An arm's value for a column is a CONSTANT when it projects a typed NULL
  // (it has no such notion) or the column is the discriminator (its `kind`).
  // A conjunctive clause over such a constant is answered once, in memory, by
  // the op's own `test` — the same one its SQL is pinned to — and a `false`
  // removes the arm. So `build.targets hasAll [sonata]` keeps builds only, while
  // a NEGATIVE op (`ne`, `notIn`, `hasNone` …), which a NULL
  // satisfies (as does `isEmpty`), keeps the arm: its rows match it.
  const filterable = unionFilterable(base, extra, discriminator);
  const constantOf = (arm: UnionArm, id: string): { value: unknown } | null => {
    if (id === discriminator.fieldId) return { value: arm.kind };
    return bindingFor(arm, id, isBaseId(id)) === null ? { value: null } : null;
  };
  const clauses = conjunctiveClauses(filter);
  const prunedArms: string[] = [];
  const surviving: UnionArm[] = [];
  for (const arm of arms) {
    const excluded = clauses.some((c) => {
      const constant = constantOf(arm, c.column);
      return constant !== null && !testClause(constant.value, c, filterable);
    });
    if (excluded) prunedArms.push(arm.kind);
    else surviving.push(arm);
  }

  // ---- effective nullability -------------------------------------------
  // A column is nullable if its spec says so OR any surviving arm nulls it. The
  // seek terms must be identical in every arm and on the outside, or a page
  // boundary that crosses the NULL region drops rows.
  const nullableOf = new Map<string, boolean>();
  for (const id of columnOrder) {
    const declared = specOf(id).nullable === true;
    const nulledSomewhere =
      id !== discriminator.fieldId &&
      surviving.some((arm) => bindingFor(arm, id, isBaseId(id)) === null);
    nullableOf.set(id, declared || nulledSomewhere);
  }

  // ---- the outer (post-union) column map + ordering keys ----------------
  // A read-only column (`domain: null`) is projected but never bound, so no
  // filter can name it and a sort on it is dropped like any unbound field.
  const outerMap: FieldColumnMap = {};
  for (const id of columnOrder) {
    const domain = specOf(id).domain;
    if (domain === null) continue;
    outerMap[id] = {
      col: sql`${ident(OUTER_ALIAS)}.${ident(id)}`,
      domain,
      nullable: nullableOf.get(id)!,
    };
  }
  const keys = appendKindKey(
    buildSortKeys(sort, outerMap, {
      // The SAME object `outerMap` holds, so `buildSortKeys`' identity-based
      // dedupe fires when the caller already sorts by the tiebreaker.
      col: outerMap[tiebreaker.fieldId]!.col,
      fieldId: tiebreaker.fieldId,
    }),
    discriminator.fieldId,
    outerMap,
  );

  // ---- the cursor -------------------------------------------------------
  const sig = sortSignature(sort);
  let cursorValues: unknown[] | null = null;
  if (cursor !== null) {
    const payload = decodeCursor(cursor);
    if (payload.s !== sig) throw new UnionCursorMismatchError(sig, payload.s);
    cursorValues = payload.v;
  }

  // ---- one subselect per surviving arm ----------------------------------
  const armSelects = surviving.map((arm) => {
    const armMap: FieldColumnMap = {};
    const projection: SQL[] = [];
    for (const id of columnOrder) {
      const expr = armExpr(arm, id, discriminator.fieldId, specOf, isBaseId);
      projection.push(sql`${expr} AS ${ident(id)}`);
      const domain = specOf(id).domain;
      if (domain === null) continue;
      armMap[id] = { col: expr, domain, nullable: nullableOf.get(id)! };
    }
    const armKeys = appendKindKey(
      buildSortKeys(sort, armMap, {
        col: armMap[tiebreaker.fieldId]!.col,
        fieldId: tiebreaker.fieldId,
      }),
      discriminator.fieldId,
      armMap,
    );

    const where = and(
      arm.where,
      compileWhere(filter, armMap),
      seekPredicate(armKeys, cursorValues),
    );

    const parts: SQL[] = [
      sql`SELECT ${sql.join(projection, sql`, `)} FROM ${arm.table}`,
    ];
    if (where) parts.push(sql`WHERE ${where}`);
    parts.push(sql`ORDER BY ${sql.join(orderByClauses(armKeys), sql`, `)}`);
    parts.push(sql`LIMIT ${limit}`);
    return sql`(${sql.join(parts, sql` `)})`;
  });

  // Every arm pruned (or none registered): the answer is provably empty, and a
  // typed all-NULL scaffold says so in valid SQL with the projection intact.
  if (armSelects.length === 0) {
    const projection = columnOrder.map(
      (id) => sql`${nullLiteral(specOf(id))} AS ${ident(id)}`,
    );
    armSelects.push(sql`(SELECT ${sql.join(projection, sql`, `)} WHERE false)`);
  }

  const unioned = sql.join(armSelects, sql` UNION ALL `);
  const statement = sql`SELECT * FROM (${unioned}) AS ${ident(OUTER_ALIAS)} ORDER BY ${sql.join(
    orderByClauses(keys),
    sql`, `,
  )} LIMIT ${limit}`;

  return { sql: statement, keys, prunedArms, sortSignature: sig };
}

/**
 * Append the discriminator as the final ordering key.
 *
 * `buildSortKeys` already appends the row-identity tiebreaker, which is unique
 * *within* an arm. Across arms it need not be — two ledgers can mint the same
 * id — and a non-total order lets the keyset seek dup or skip at a page seam.
 * `(…, id, kind)` is total by construction. Within one arm the key is a
 * constant, so it costs the planner nothing.
 */
function appendKindKey(
  keys: SortKey[],
  discriminatorId: string,
  map: FieldColumnMap,
): SortKey[] {
  if (keys.some((k) => k.fieldId === discriminatorId)) return keys;
  return [
    ...keys,
    {
      fieldId: discriminatorId,
      col: map[discriminatorId]!.col,
      dir: "asc",
      nullable: false,
    },
  ];
}

/** `NULL::<sqlType>` — the cast is what makes `UNION ALL` type-check. */
function nullLiteral(spec: UnionColumnSpec): SQL {
  return sql.raw(`NULL::${spec.sqlType}`);
}

/** What this arm projects into `id`: its own expression, its kind, or a typed NULL. */
function armExpr(
  arm: UnionArm,
  id: string,
  discriminatorId: string,
  specOf: (id: string) => UnionColumnSpec,
  isBaseId: (id: string) => boolean,
): SQL {
  if (id === discriminatorId) return sql`${arm.kind}::text`;
  const binding = bindingFor(arm, id, isBaseId(id));
  if (binding === null) return nullLiteral(specOf(id));
  return sql`${binding}`;
}

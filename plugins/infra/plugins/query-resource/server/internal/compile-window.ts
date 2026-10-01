import { and, inArray, is, sql, SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db as realDb } from "@plugins/database/server";
import {
  defineDeferredResource,
  defineResource,
} from "@plugins/framework/plugins/server-core/core";
import type {
  KeyedMembership,
  KeyedServerResourceOptions,
  Resource,
  ResourceParams,
  RoutedRecomputeOn,
  ScopePolicy,
  TupleUse,
} from "@plugins/framework/plugins/resource-runtime/core";
import {
  atOrBeforePredicate,
  orderByClauses,
  seekPredicate,
  type SortKey,
} from "@plugins/primitives/plugins/keyset/server";
import type {
  PointParams,
  WindowParams,
  WindowSelector,
} from "@plugins/primitives/plugins/live-state/core";
import {
  BASE_RELATION,
  type PointQueryResourceContract,
  type WindowQueryResourceContract,
} from "@plugins/infra/plugins/query-resource/core";
import { resolveIdentity, wireFieldFor } from "./identity";
import {
  compileJoins,
  familyRoute,
  joinRoute,
  projectedField,
  routeColumnsOf,
  sameColumn,
  type JoinPlan,
  type ReadColumn,
  type RelationColumn,
} from "./joins";
import {
  baseIdentityRoute,
  compiledRoutePlan,
  routedBase,
  type RoutedBase,
} from "./routes";
import type {
  QueryDb,
  QueryStep,
  SelectMap,
  WindowOrderKey,
  WindowQueryResourceSpec,
} from "./spec";

// The bounded-membership (window / point) compiler — the `queryResource`
// sibling for the bounded working-set contract
// (research/2026-07-18-global-bounded-working-set-resource-contract.md). One
// declaration derives, per kind:
//
// - **window**: the windowed FULL loader (`where → ORDER BY (declared keys +
//   pk tiebreaker, NULLS LAST) → LIMIT`, the limit decoded from the params via
//   the descriptor codec and clamped to `maxLimit`), the Layer-2 scoped refill
//   (`where ∧ pk IN affectedIds`, no order/limit), and `windowIdsOf` (the
//   ids-only windowed query — SAME where/order/limit, so the loader and the
//   membership authority cannot drift), and `orderSignatureOf` (the canonical
//   encoding of the declared order columns' wire values — an UPDATE that moves
//   an order column re-derives the window instead of going stale), emitted as
//   `membership: { kind: "window", windowIdsOf, orderSignatureOf }`. A
//   function `orderBy` is resolved per params tuple (the rendered ORDER BY
//   memoized per canonical order). The signature is per tuple — the columns
//   THAT tuple orders by — cut from `signatureColumns`, the universe of every
//   column any tuple may sort by.
// - **point**: the loader as a scoped read over `ctx?.affectedIds ??
//   decode(params)` (an empty id set short-circuits to `[]` — a legitimately
//   empty value, no query), emitted as `membership: { kind: "point", idsOf }`
//   where `idsOf` IS the descriptor's pure `point.decode`.
//
// Both kinds are ROUTED (research/2026-09-29-global-scoped-change-routing.md):
// the scope policy is `routes` — an `identity` route on the base table plus one
// route per declared join (`./joins`) — rather than a declared `identityTable`,
// so `routeTableChange` serves them and the legacy read-set path never does.
// Every shape of one tuple (full, scoped, ids, point) joins exactly the
// relations its `usesOf` names (`routedReads`), read off the SQL it renders.
// Hence a base table, never a view (A1: a view has no trigger and no route can
// name it), and no `rel()` edges: a routed entry routes the tables it reads
// itself.

/**
 * The compiled server half of a bounded resource, ready for `defineResource`.
 * Its identity table is not a field: it is the table of the routes' identity
 * route, which the runtime derives.
 */
export interface CompiledWindowQuery<Row, P extends ResourceParams> {
  serverOpts: KeyedServerResourceOptions<Row[], P> & ScopePolicy<P>;
  keyField: string;
}

type AnyWindowContract<Row, P extends WindowParams = WindowParams> =
  WindowQueryResourceContract<Row, P, never> | PointQueryResourceContract<Row>;

function guard(
  condition: unknown,
  key: string,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`windowQueryResource("${key}"): ${message}`);
  }
}

/** The projection alias of a scroll row key's i-th part (never a row field: it is folded away). */
const rowKeyPart = (i: number): string => `__row_key_${i}`;

/** The projection alias of the i-th family member a tuple orders by (folded under `valuesKey`). */
const familyPart = (i: number): string => `__family_${i}`;

const VALUE: TupleUse = { role: "value" };

/** One tuple's SQL: its `where`, the joins it includes, and its read-set. */
interface TupleReads {
  where: SQL | undefined;
  /** The joins this tuple's SQL includes — every shape of it (full, scoped, ids, point). */
  included: ReadonlySet<string>;
  /** `usesOf`'s answer: the base, and every included join in its role. */
  uses: ReadonlyMap<string, TupleUse>;
}

/**
 * The routed half of a bounded compile: the routes (the base's `identity`, one
 * per declared join) and each tuple's reads, derived from the SQL fragments the
 * loaders render — never declared beside them. A tuple includes a join when its
 * SQL references it (projected, a required lookup, or named by its `where` /
 * order) or a join hangs off it; the join is read as `membership` when it can
 * move the tuple's membership or order (required, or referenced — through a
 * later join in its chain too — by the `where` / order), else as `value` (a LEFT
 * join that is only projected).
 */
function routedReads<P extends ResourceParams>(opts: {
  label: string;
  base: RoutedBase;
  joins: JoinPlan;
  /**
   * What the SQL projects: the `select` map, or — with none — every column of
   * the source (`resolveIdentity`'s `columns`), which a select-all reads.
   */
  projection: SelectMap;
  pk: PgColumn;
  /** The wire field the pk is projected under. */
  keyField: string;
  where: WindowQueryResourceSpec<P>["where"];
  whereReads: readonly (PgColumn | SQL)[] | undefined;
  /** Every column any tuple may order by (the signature); `[]` for a point set. */
  orderColumns: readonly ReadColumn[];
  orderOf: (params: P) => readonly WindowOrderKey[];
  recomputeOn?: ReadonlyArray<RoutedRecomputeOn>;
  /** What a lookup's reverse route probes the hosts with. */
  db: QueryDb;
}): {
  tuple: (params: P) => TupleReads;
  scopePolicy: (membership: KeyedMembership<P>) => ScopePolicy<P>;
} {
  const { joins, where, projection } = opts;
  if (
    joins
      .columnsIn(projection[opts.keyField])
      .some(([relation]) => relation !== BASE_RELATION)
  ) {
    throw new Error(
      `${opts.label}: the key field "${opts.keyField}" projects a joined column — a row's key is its base table's identity.`,
    );
  }
  const projected = joins.relationsIn(Object.values(projection));
  const open = typeof where === "function" && opts.whereReads === undefined;
  const reads: RelationColumn[] = [
    ...joins.columnsIn(Object.values(projection)),
    ...joins.columnsIn(opts.pk),
    ...joins.columnsIn(typeof where === "function" ? undefined : where),
    ...joins.columnsIn(opts.whereReads ?? []),
    ...joins.columnsIn(opts.orderColumns),
  ];
  const columnsOf = routeColumnsOf(joins, opts.base, reads, open);
  const host = { base: opts.base, pk: opts.pk, plan: joins, db: opts.db };
  const routes = [
    baseIdentityRoute(opts.base, opts.pk, columnsOf(BASE_RELATION)),
    ...joins.joins.map((j) => joinRoute(j, host, columnsOf(j.alias))),
    // One route per family, whatever its members: which members a tuple
    // reads is its `match`, not a route of its own.
    ...joins.families.map((f) => familyRoute(f)),
  ];

  const tuple = (params: P): TupleReads => {
    const w = typeof where === "function" ? where(params) : where;
    const whereCols = joins.columnsIn(w);
    if (typeof where === "function" && !open) {
      for (const [relation, column] of whereCols) {
        // A family member's columns are its route's, whatever the member.
        if (joins.familyOf(relation) !== undefined) continue;
        if (!columnsOf(relation).includes(column)) {
          throw new Error(
            `${opts.label}: the \`where\` reads "${relation}"."${column}", which is not in \`whereReads\` — the route columns would miss it. Declare it there.`,
          );
        }
      }
    }
    const order = opts.orderOf(params);
    const seeds = new Set<string>(joins.required);
    for (const [relation] of whereCols) seeds.add(relation);
    for (const k of order) seeds.add(joins.relationOf(k.col));
    const membership = joins.closure(seeds);
    const included = joins.closure([...membership, ...projected]);
    // Per relation, the columns whose change can move THIS tuple: what its
    // `where` and order read, and the conditions of the joins it reads as
    // membership (a moved key re-points an INNER join, or the row a filtered /
    // sorted join reads). A U touching none of them cannot move the tuple
    // (`TupleUse.moves`): the runtime delivers it as a value change.
    const moving = new Map<string, Set<string>>();
    const conditions = joins.joins
      .filter((j) => membership.has(j.alias))
      .flatMap((j) => joins.columnsIn(j.on));
    for (const [relation, column] of [
      ...whereCols,
      ...joins.columnsIn(order.map((k) => k.col)),
      ...conditions,
    ]) {
      let set = moving.get(relation);
      if (!set) moving.set(relation, (set = new Set()));
      set.add(column);
    }
    const membershipUse = (relation: string): TupleUse => ({
      role: "membership",
      moves: [...(moving.get(relation) ?? [])].sort(),
    });
    const uses = new Map<string, TupleUse>([
      [BASE_RELATION, membershipUse(BASE_RELATION)],
    ]);
    for (const j of joins.joins) {
      if (included.has(j.alias)) {
        uses.set(
          j.alias,
          membership.has(j.alias) ? membershipUse(j.alias) : VALUE,
        );
      }
    }
    // A family's members are joined only where a `where` / order names them,
    // so a tuple reads its family as membership, matching those members.
    const members = new Map<string, Set<string>>();
    for (const relation of included) {
      const m = joins.familyOf(relation);
      if (m === undefined) continue;
      let set = members.get(m.family.id);
      if (!set) members.set(m.family.id, (set = new Set()));
      set.add(m.member);
    }
    for (const family of joins.families) {
      const set = members.get(family.id);
      if (set === undefined) continue;
      uses.set(family.id, {
        role: "membership",
        match: { [family.member.name]: set },
      });
    }
    return { where: w, included, uses };
  };

  return {
    tuple,
    scopePolicy: (membership) => ({
      routes: compiledRoutePlan<P>(routes, (params) => tuple(params).uses),
      membership,
      ...(opts.recomputeOn !== undefined && opts.recomputeOn.length > 0
        ? { recomputeOn: opts.recomputeOn }
        : {}),
    }),
  };
}

/**
 * Turn a bounded spec + its shared contract into the two-arg `defineResource`
 * server half. Exported separately from `windowQueryResource` (which also
 * registers) so unit tests can compile against a fake `db` — mirroring
 * `compileQuery`. All spec-shape misuse throws HERE, at module eval, so a bad
 * declaration is a boot crash, never a silent misbehavior.
 */
export function compileWindowQuery<Row, P extends WindowParams | PointParams>(
  contract: AnyWindowContract<Row, P & WindowParams>,
  spec: WindowQueryResourceSpec<P>,
): CompiledWindowQuery<Row, P> {
  const key = contract.key;
  guard(
    !(spec.window && spec.point),
    key,
    "`window` and `point` are mutually exclusive — a resource's membership is one selector kind. Split it into two resources.",
  );
  guard(
    spec.window || spec.point,
    key,
    "declare `window: { maxLimit }` or `point: { by }` — for an unbounded scan use queryResource(...) instead.",
  );

  // One boundary cast — same as `compileQuery` (the entities plugin precedent).
  const db: QueryDb = spec.db ?? (realDb as unknown as QueryDb);

  // The declared wire encoding, applied to every row a loader returns.
  const encodeRow = spec.encodeRow;
  const encoded = (rows: Row[]): Row[] =>
    encodeRow
      ? rows.map((r) => encodeRow(r as Record<string, unknown>) as Row)
      : rows;

  const label = `windowQueryResource("${key}")`;
  const base = routedBase(spec.from, label);

  if (spec.point) {
    const codec = (contract as PointQueryResourceContract<Row>).point;
    guard(
      codec,
      key,
      "spec declares `point` but the descriptor carries no point codec — a point resource is a `liveCollection`'s `:rows` sibling (network/live): declare the collection and serve it with `serveCollection`, which compiles `c.rows` with `point: { by }`.",
    );
    guard(
      spec.orderBy === undefined &&
        spec.signatureColumns === undefined &&
        spec.scroll === undefined,
      key,
      "`orderBy` / `signatureColumns` / `scroll` are meaningless with `point` — point sets are unordered (entrants append), so there is no order to cut or key.",
    );
    guard(
      spec.families === undefined && spec.recomputeOn === undefined,
      key,
      "`families` / `recomputeOn` are window-only — a point read is by id, with no `where` or order to name a family member.",
    );
    guard(
      spec.identity?.pk === undefined || spec.identity.pk === spec.point.by,
      key,
      "`point.by` must BE the identity pk (the change-feed routes by intersecting changed identity ids with each tuple's set) — drop the redundant `identity.pk` or make them the same column.",
    );

    const { rel, pkColumn, keyField, selectMap, columns } = resolveIdentity(
      spec.from,
      { pk: spec.point.by },
      spec.select,
    );
    const joins = compileJoins(base, spec.joins ?? [], pkColumn, label);
    guard(
      joins.joins.length === 0 || spec.select !== undefined,
      key,
      "a spec with `joins` needs an explicit `select` — the projection names each joined column it puts on the wire.",
    );
    const reads = routedReads<P>({
      label,
      base,
      joins,
      projection: selectMap ?? columns,
      pk: pkColumn,
      keyField,
      where: spec.where,
      whereReads: spec.whereReads,
      orderColumns: [],
      orderOf: () => [],
      db,
    });

    const from = (included: ReadonlySet<string>): QueryStep<Row> =>
      joins.apply(
        (selectMap ? db.select<Row>(selectMap) : db.select<Row>()).from(rel),
        included,
      );

    const loader = async (
      params: P,
      ctx?: { affectedIds: readonly string[] },
    ): Promise<Row[]> => {
      const ids = ctx?.affectedIds ?? codec.decode(params);
      if (ids.length === 0) return [];
      const { where: w, included } = reads.tuple(params);
      const pred = inArray(pkColumn, [...ids]);
      return encoded(await from(included).where(w ? and(w, pred)! : pred));
    };

    const membership: KeyedMembership<P> = {
      kind: "point",
      idsOf: (params) => codec.decode(params),
    };

    // Annotated, not cast: the `as` on `serverOpts` below launders the spreads
    // and would hide a missing `ScopePolicy` arm, so the policy is built as its
    // own CHECKED value first. `membership` is this compiler's answer to "which
    // subscribed tuple owns a changed row" — the router intersects the changed
    // identity ids with the point set — so it needs no `fanOut`.
    const scopePolicy: ScopePolicy<P> = reads.scopePolicy(membership);

    const serverOpts = {
      loader,
      ...scopePolicy,
      ...(spec.debounceMs != null ? { debounceMs: spec.debounceMs } : {}),
    } as KeyedServerResourceOptions<Row[], P> & ScopePolicy<P>;
    return { serverOpts, keyField };
  }

  // Window kind.
  const codec = (contract as WindowQueryResourceContract<Row, P & WindowParams>)
    .window;
  guard(
    codec,
    key,
    "spec declares `window` but the descriptor carries no window codec — a window resource is a `liveCollection` (network/live) declared with `default` and `maxLimit`: declare it there and serve it with `serveCollection`, which compiles `c.window` with `window`.",
  );
  guard(
    spec.orderBy !== undefined,
    key,
    "a bounded window REQUIRES `orderBy` — without a total order, `LIMIT n` names no stable window.",
  );
  const specMaxLimit = spec.window!.maxLimit;
  guard(
    specMaxLimit === undefined ||
      codec.maxLimit === undefined ||
      specMaxLimit === codec.maxLimit,
    key,
    `window.maxLimit (${specMaxLimit}) disagrees with the descriptor's maxLimit (${codec.maxLimit}) — the client's encoder and the server clamp must be one number. Declare it in one place.`,
  );
  const maxLimit = specMaxLimit ?? codec.maxLimit;
  guard(
    maxLimit !== undefined,
    key,
    "declare `window.maxLimit` on the spec or `maxLimit` on the descriptor's window codec — a window needs a clamp.",
  );
  guard(
    Number.isSafeInteger(maxLimit) && maxLimit > 0,
    key,
    `window.maxLimit must be a positive integer, got ${maxLimit}.`,
  );
  guard(
    codec.defaultLimit <= maxLimit,
    key,
    `the descriptor's defaultLimit (${codec.defaultLimit}) exceeds window.maxLimit (${maxLimit}) — the default window would be silently truncated.`,
  );

  const { rel, pkColumn, keyField, selectMap, columns } = resolveIdentity(
    spec.from,
    spec.identity,
    spec.select,
  );
  const families = spec.families;
  const joins = compileJoins(
    base,
    spec.joins ?? [],
    pkColumn,
    label,
    families?.joins ?? [],
  );
  guard(
    joins.joins.length === 0 || spec.select !== undefined,
    key,
    "a spec with `joins` needs an explicit `select` — the projection names each joined column it puts on the wire.",
  );

  const orderSpec = spec.orderBy;
  const orderFn = typeof orderSpec === "function" ? orderSpec : undefined;
  const staticOrder: WindowOrderKey[] | undefined =
    typeof orderSpec === "function"
      ? undefined
      : Array.isArray(orderSpec)
        ? orderSpec
        : [orderSpec];
  guard(
    staticOrder || (spec.signatureColumns && spec.signatureColumns.length > 0),
    key,
    "a function `orderBy` REQUIRES a non-empty `signatureColumns` — the union of every column it may sort by, each projected, so an UPDATE to the columns a tuple sorts by re-derives its window.",
  );

  // Order signature: the canonical join of the row's wire values of the columns
  // its tuple orders by (the auto pk tiebreaker is immutable, hence excluded),
  // cut from `signatureColumns` — the declared order columns for a static
  // order, else every column any tuple may sort by. Always
  // emitted for the window kind — no opt-in surface: the runtime compares it
  // per refilled member row and re-derives the window (one bounded
  // `windowIdsOf`) when it moved, so an UPDATE that bumps an order column (a
  // `createdAt` resurface) reorders the wire window instead of leaving it
  // stale. Every signature column must therefore be projected — the signature
  // is computed over the wire row the loader returns.
  const signatureColumns: ReadColumn[] =
    spec.signatureColumns ?? staticOrder!.map((k) => k.col);
  const nameOf = (col: ReadColumn): string => joins.columnOf(col).name;
  // A family member's alias, when the order key reads one.
  const memberAliasOf = (col: ReadColumn): string | undefined => {
    const relation = joins.relationOf(col);
    return joins.familyOf(relation) === undefined ? undefined : relation;
  };
  // A family member the tuple orders by is signed through its own projection
  // (`familyPart`), not `signatureColumns`, whose universe is static.
  const covered = (col: ReadColumn): boolean =>
    sameColumn(col, pkColumn) ||
    signatureColumns.some((c) => sameColumn(c, col)) ||
    memberAliasOf(col) !== undefined;
  // An order column outside the signature would reorder without the runtime
  // noticing — the tuple's order would go stale. Checked at module eval for a
  // static order, per resolved order for a function one.
  const assertCovered = (order: readonly WindowOrderKey[]): void => {
    for (const k of order) {
      guard(
        covered(k.col),
        key,
        `the order column "${nameOf(k.col)}" is not in \`signatureColumns\` — an UPDATE to it would leave the window's order stale. Add it to \`signatureColumns\`.`,
      );
    }
  };
  if (staticOrder) assertCovered(staticOrder);
  // A joined sortable column is projected and signed like a base one (A4): a
  // side-table write that moves it then moves the signature, so the runtime
  // re-derives the window rather than leave the order stale.
  const orderFields = signatureColumns.map((col) => {
    const field = selectMap
      ? projectedField(selectMap, col)
      : wireFieldFor(undefined, columns, joins.columnOf(col));
    guard(
      field !== undefined,
      key,
      `the order column "${nameOf(col)}" is not projected — the window's order ` +
        `signature is derived from the wire row, so every declared order column ` +
        `must appear in \`select\`.`,
    );
    return field;
  });
  // Per tuple: the fields of the columns THIS tuple orders by (the pk
  // tiebreaker excluded — immutable), so a write to a column only another
  // tuple sorts by — a joined `lastPlayedAt` under a `title` sort — leaves this
  // tuple's signature still and costs it no ids query. Memoized per params
  // object (the runtime hands one per tuple); a stored and a fresh signature
  // of one tuple are always cut from the same fields.
  const readField =
    spec.readField ??
    ((row: Record<string, unknown>, field: string): unknown => row[field]);
  // A family member's folded value (see `folded`), by its join alias.
  const readMember = (row: Record<string, unknown>, alias: string): unknown =>
    (row[families!.valuesKey] as Record<string, unknown> | undefined)?.[alias];
  type SigReader = (row: Record<string, unknown>) => unknown;
  const tupleSigFields = new WeakMap<object, readonly SigReader[]>();
  const sigFieldsOf = (params: P): readonly SigReader[] => {
    let fields = tupleSigFields.get(params);
    if (fields === undefined) {
      const order = staticOrder ?? orderFn!(params);
      assertCovered(order);
      fields = order.flatMap((k): SigReader[] => {
        const alias = memberAliasOf(k.col);
        if (alias !== undefined) return [(row) => readMember(row, alias)];
        const i = signatureColumns.findIndex((c) => sameColumn(c, k.col));
        // Not a signature column ⇒ the pk (`assertCovered`): immutable.
        if (i === -1) return [];
        const field = orderFields[i]!;
        return [(row) => readField(row, field)];
      });
      tupleSigFields.set(params, fields);
    }
    return fields;
  };
  const orderSignatureOf = (row: unknown, params: P): string =>
    sigFieldsOf(params)
      .map(
        (read) =>
          JSON.stringify(read(row as Record<string, unknown>)) ?? "undefined",
      )
      .join("\u0000");

  // Declared order keys + the pk tiebreaker (skipped when a key already targets
  // the pk column — same rule as keyset's `buildSortKeys`), rendered with
  // explicit NULLS LAST so a cut's seek stays symmetric. ONE key list per
  // order feeds the ORDER BY, a scroll's cuts and its row keys, so the three
  // cannot disagree about what the order is.
  //
  // A column a LEFT join reads is NULL for a host with no joined row, whatever
  // its own NOT NULL says — so it orders as nullable.
  const orderKeys = (declared: readonly WindowOrderKey[]): SortKey[] => {
    const keys: SortKey[] = declared.map((k) => ({
      fieldId: nameOf(k.col),
      col: k.col,
      dir: k.dir ?? "asc",
      nullable: (k.nullable ?? false) || joins.canBeNull(k.col),
    }));
    if (!keys.some((k) => sameColumn(k.col as ReadColumn, pkColumn))) {
      keys.push({
        fieldId: pkColumn.name,
        col: pkColumn,
        dir: "asc",
        nullable: false,
      });
    }
    return keys;
  };
  /**
   * One tuple's order: its keys, their ORDER BY, and the extra projection it
   * rides — a scroll's row-key parts, and the family members it orders by
   * (`members`: each one's projection alias and join alias).
   */
  interface OrderPlan {
    keys: SortKey[];
    sql: SQL[];
    keySelect: SelectMap;
    members: readonly (readonly [part: string, alias: string])[];
  }
  const scroll = spec.scroll;
  const planOrder = (declared: readonly WindowOrderKey[]): OrderPlan => {
    const keys = orderKeys(declared);
    const members = declared.flatMap((k, i) => {
      const alias = memberAliasOf(k.col);
      return alias === undefined
        ? []
        : [{ part: familyPart(i), alias, col: k.col }];
    });
    return {
      keys,
      sql: orderByClauses(keys),
      keySelect: {
        // The row key's parts, as Postgres's own text: exact, whatever the type.
        ...(scroll
          ? Object.fromEntries(
              keys.map((k, i) => [
                rowKeyPart(i),
                sql`${k.col}::text`.as(rowKeyPart(i)),
              ]),
            )
          : {}),
        ...Object.fromEntries(
          members.map(({ part, col }) => [part, sql`${col}`.as(part)]),
        ),
      },
      members: members.map(({ part, alias }) => [part, alias] as const),
    };
  };
  const staticPlan = staticOrder ? planOrder(staticOrder) : undefined;
  // Per-params order, memoized per canonical order. Bounded by the resolver's
  // own vocabulary (its sortable columns × directions × the SQL types a
  // column may read as), never by the params.
  //
  // A key's rendering is part of its identity: a family member keeps its
  // alias and column when its definition is retyped, but reads through a
  // different cast (`readMember` hands one registered expression per cast) —
  // keyed on the name alone, the ORDER BY, the `$scoped` projection and a
  // cut's operand cast would keep the old cast after the retype. So an
  // expression key also names its SQL type and the expression object (every
  // expression a plan reads is registered and cached by it: bounded); a plain
  // column is its relation and name.
  const orderMemo = new Map<string, OrderPlan>();
  const expressionIds = new WeakMap<SQL, number>();
  let nextExpressionId = 0;
  const renderingOf = (col: ReadColumn): string | number => {
    if (!is(col, SQL)) return "column";
    let id = expressionIds.get(col);
    if (id === undefined) {
      id = nextExpressionId++;
      expressionIds.set(col, id);
    }
    return id;
  };
  const orderPlanOf = (params: P): OrderPlan => {
    if (staticPlan) return staticPlan;
    const declared = orderFn!(params);
    const canonical = JSON.stringify(
      declared.map((k) => [
        joins.relationOf(k.col),
        nameOf(k.col),
        joins.sqlTypeOf(k.col),
        renderingOf(k.col),
        k.dir ?? "asc",
        k.nullable ?? false,
      ]),
    );
    let plan = orderMemo.get(canonical);
    if (!plan) {
      assertCovered(declared);
      plan = planOrder(declared);
      orderMemo.set(canonical, plan);
    }
    return plan;
  };
  const orderSqlOf = (params: P): SQL[] => orderPlanOf(params).sql;

  // A scroll segment's cuts, compiled on the ORDER side over the tuple's own
  // keys: `after` exclusive (the keyset seek), `until` inclusive. Each operand
  // is a key's exact text, cast back to its column's type — so Postgres
  // compares the value it stored, not a rounded one.
  const cutWhere = (params: P): SQL | undefined => {
    if (!scroll) return undefined;
    const { after, until } = scroll.cutsOf(params);
    if (after === undefined && until === undefined) return undefined;
    const { keys } = orderPlanOf(params);
    const operands = (
      cut: readonly (string | null)[],
      which: string,
    ): unknown[] => {
      guard(
        cut.length === keys.length,
        key,
        `the "${which}" cut has ${cut.length} value(s) for the tuple's ${keys.length} order key(s) — a cut is a row key of exactly this order.`,
      );
      return cut.map((v, i) =>
        v === null
          ? null
          : sql`${v}::${sql.raw(joins.sqlTypeOf(keys[i]!.col as ReadColumn))}`,
      );
    };
    const parts: SQL[] = [];
    if (after !== undefined) {
      parts.push(seekPredicate(keys, operands(after, "after"))!);
    }
    if (until !== undefined) {
      parts.push(atOrBeforePredicate(keys, operands(until, "until")));
    }
    return parts.length === 1 ? parts[0] : and(...parts);
  };

  // Folds a scroll row's key parts into its row key (the canonical JSON of the
  // parts; `null` over the byte bound), and the family members the tuple
  // orders by into `valuesKey` (by join alias); drops the parts: they are not
  // row fields. Every full and scoped row goes through it, before `encodeRow`.
  const folded = (rows: Row[], params: P): Row[] => {
    const plan = orderPlanOf(params);
    if (!scroll && plan.members.length === 0) return rows;
    const n = plan.keys.length;
    return rows.map((r) => {
      const row = { ...(r as Record<string, unknown>) };
      if (scroll) {
        const parts: (string | null)[] = [];
        for (let i = 0; i < n; i++) {
          parts.push(row[rowKeyPart(i)] as string | null);
          delete row[rowKeyPart(i)];
        }
        const json = JSON.stringify(parts);
        row[scroll.keyField] =
          Buffer.byteLength(json, "utf8") > scroll.maxKeyBytes ? null : json;
      }
      if (plan.members.length > 0) {
        const values: Record<string, unknown> = {};
        for (const [part, alias] of plan.members) {
          values[alias] = row[part] ?? null;
          delete row[part];
        }
        row[families!.valuesKey] = values;
      }
      return row as Row;
    });
  };

  // The subscription's decoded limit, clamped — ONE helper feeds the loader AND
  // `windowIdsOf`, so the value the clients see and the membership authority can
  // never disagree about the window size.
  const decodeLimit =
    spec.window!.limitOf ?? ((params: P) => codec.decode(params).limit);
  const limitOf = (params: P): number =>
    Math.min(decodeLimit(params), maxLimit);

  const reads = routedReads<P>({
    label,
    base,
    joins,
    projection: selectMap ?? columns,
    pk: pkColumn,
    keyField,
    where: spec.where,
    whereReads: spec.whereReads,
    orderColumns: signatureColumns,
    orderOf: (params) => (staticOrder ? staticOrder : orderFn!(params)),
    ...(spec.recomputeOn !== undefined
      ? { recomputeOn: spec.recomputeOn }
      : {}),
    db,
  });

  // A scroll row's key parts and the family members its order reads ride the
  // projection (see `planOrder`); a select-all spec projects the source's
  // columns explicitly so they can join them.
  const from = (included: ReadonlySet<string>, params: P): QueryStep<Row> => {
    const keySelect = orderPlanOf(params).keySelect;
    const projection =
      Object.keys(keySelect).length === 0
        ? selectMap
        : { ...(selectMap ?? columns), ...keySelect };
    return joins.apply(
      (projection ? db.select<Row>(projection) : db.select<Row>()).from(rel),
      included,
    );
  };

  // The tuple's `where` (checked against its declared universe by
  // `reads.tuple`), ANDed with its segment cuts — order-side, checked against
  // its order keys instead.
  const whereOf = (params: P, w: SQL | undefined): SQL | undefined => {
    const cut = cutWhere(params);
    return w && cut ? and(w, cut) : (w ?? cut);
  };

  // FULL loader = the windowed query — bounded by construction, so the runtime's
  // FULL branches (no snapshot, sticky-FULL, evicted-snapshot self-heal) can
  // never sweep the whole collection.
  function buildFull(params: P): QueryStep<Row> {
    const { where: tw, included } = reads.tuple(params);
    const w = whereOf(params, tw);
    let q = from(included, params);
    if (w) q = q.where(w);
    return q.orderBy(...orderSqlOf(params)).limit(limitOf(params));
  }

  // Scoped refill: `where ∧ cuts ∧ pk IN affectedIds`, NO order/limit — a
  // partial refill of only the changed rows (the membership diff owns
  // placement).
  function buildScoped(
    params: P,
    affectedIds: readonly string[],
  ): QueryStep<Row> {
    const { where: tw, included } = reads.tuple(params);
    const w = whereOf(params, tw);
    const pred = inArray(pkColumn, [...affectedIds]);
    return from(included, params).where(w ? and(w, pred)! : pred);
  }

  const loader = async (
    params: P,
    ctx?: { affectedIds: readonly string[] },
  ): Promise<Row[]> =>
    encoded(
      folded(
        await (ctx ? buildScoped(params, ctx.affectedIds) : buildFull(params)),
        params,
      ),
    );

  // The ids-only bounded ordered id list — the membership authority. Same
  // where/cuts/order/limit as the FULL loader, projecting ONLY the pk.
  const windowIdsOf = async (params: P): Promise<string[]> => {
    // The SAME joins as the loader (the tuple's reads), so the membership
    // authority and the rows it admits read one relation set.
    const { where: tw, included } = reads.tuple(params);
    const w = whereOf(params, tw);
    let q: QueryStep<Record<string, unknown>> = joins.apply(
      db.select<Record<string, unknown>>({ [keyField]: pkColumn }).from(rel),
      included,
    );
    if (w) q = q.where(w);
    const rows = await q.orderBy(...orderSqlOf(params)).limit(limitOf(params));
    return rows.map((r) => String(r[keyField]));
  };

  const membership: KeyedMembership<P> = {
    kind: "window",
    windowIdsOf,
    orderSignatureOf,
  };

  // Annotated, not cast — see the point branch above: the window membership IS
  // the tuple-ownership answer, and building the policy as its own checked value
  // is what keeps the `as` on `serverOpts` from hiding a missing arm.
  const scopePolicy: ScopePolicy<P> = reads.scopePolicy(membership);

  const validateParams = spec.window!.validateParams;
  const serverOpts = {
    loader,
    ...scopePolicy,
    ...(spec.debounceMs != null ? { debounceMs: spec.debounceMs } : {}),
    ...(validateParams !== undefined ? { validateParams } : {}),
  } as KeyedServerResourceOptions<Row[], P> & ScopePolicy<P>;
  return { serverOpts, keyField };
}

/** The descriptor/keyField drift assertion every registration makes. */
function assertKeyField(
  descriptor: AnyWindowContract<unknown>,
  keyField: string,
): void {
  if (descriptor.queryPk !== keyField) {
    throw new Error(
      `windowQueryResource("${descriptor.key}"): the descriptor's pkField ` +
        `"${descriptor.queryPk}" does not match the keyField "${keyField}" ` +
        `derived from the query's identity column. The descriptor's keyOf and the ` +
        `resource's identity must key on the same field — fix the pkField passed ` +
        `to the descriptor factory, or the identity/select in the spec.`,
    );
  }
}

/**
 * `windowQueryResource` whose spec is only known at boot, once contributions
 * are collected (a collection whose columns other plugins contribute): the
 * resource registers now under its descriptor, and `specOf` compiles at
 * `bindDeferredResources` — through the same compiler and the same checks.
 */
export function deferredWindowQueryResource<
  Row,
  P extends WindowParams = WindowParams,
  S extends WindowSelector = WindowSelector,
>(
  descriptor: WindowQueryResourceContract<Row, P, S>,
  specOf: () => WindowQueryResourceSpec<P>,
): Resource<Row[], P>;
export function deferredWindowQueryResource<Row>(
  descriptor: PointQueryResourceContract<Row>,
  specOf: () => WindowQueryResourceSpec<PointParams>,
): Resource<Row[], PointParams>;
export function deferredWindowQueryResource<Row>(
  descriptor: AnyWindowContract<Row>,
  specOf: () =>
    | WindowQueryResourceSpec<WindowParams>
    | WindowQueryResourceSpec<PointParams>,
): Resource<Row[], WindowParams> | Resource<Row[], PointParams> {
  return defineDeferredResource(descriptor, () => {
    const { serverOpts, keyField } = compileWindowQuery(
      descriptor,
      specOf() as WindowQueryResourceSpec<WindowParams | PointParams>,
    );
    assertKeyField(descriptor as AnyWindowContract<unknown>, keyField);
    return serverOpts;
  });
}

/**
 * Compile a bounded spec and register the keyed resource against the shared
 * contract. Asserts the contract's `queryPk` equals the derived keyField — a
 * LOUD throw at module evaluation (boot crash) on drift, exactly like
 * `queryResource`.
 */
export function windowQueryResource<
  Row,
  P extends WindowParams = WindowParams,
  S extends WindowSelector = WindowSelector,
>(
  descriptor: WindowQueryResourceContract<Row, P, S>,
  spec: WindowQueryResourceSpec<P>,
): Resource<Row[], P>;
export function windowQueryResource<Row>(
  descriptor: PointQueryResourceContract<Row>,
  spec: WindowQueryResourceSpec<PointParams>,
): Resource<Row[], PointParams>;
export function windowQueryResource<Row>(
  descriptor: AnyWindowContract<Row>,
  spec:
    | WindowQueryResourceSpec<WindowParams>
    | WindowQueryResourceSpec<PointParams>,
): Resource<Row[], WindowParams> | Resource<Row[], PointParams> {
  const { serverOpts, keyField } = compileWindowQuery(
    descriptor,
    spec as WindowQueryResourceSpec<WindowParams | PointParams>,
  );
  assertKeyField(descriptor as AnyWindowContract<unknown>, keyField);
  return defineResource(descriptor, serverOpts);
}

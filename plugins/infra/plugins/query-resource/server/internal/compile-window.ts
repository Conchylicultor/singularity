import { and, inArray, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db as realDb } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import type {
  DependsOnEntry,
  KeyedMembership,
  Resource,
  ScopePolicy,
  ServerResourceOptions,
} from "@plugins/framework/plugins/resource-runtime/core";
import {
  orderByClauses,
  type SortKey,
} from "@plugins/primitives/plugins/keyset/server";
import type {
  PointParams,
  WindowParams,
  WindowSelector,
} from "@plugins/primitives/plugins/live-state/core";
import type {
  PointQueryResourceContract,
  WindowQueryResourceContract,
} from "@plugins/infra/plugins/query-resource/core";
import type { CompiledQuery } from "./compile";
import { resolveIdentity, wireFieldFor } from "./identity";
import { compileEdge } from "./rel";
import type {
  QueryDb,
  QueryStep,
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
//   memoized per canonical order), and its signature covers the declared
//   `signatureColumns` — every column any tuple may sort by.
// - **point**: the loader as a scoped read over `ctx?.affectedIds ??
//   decode(params)` (an empty id set short-circuits to `[]` — a legitimately
//   empty value, no query), emitted as `membership: { kind: "point", idsOf }`
//   where `idsOf` IS the descriptor's pure `point.decode`.
//
// Both kinds keep the plain `identityTable` scope policy — bounded membership
// requires an own-identity scoped resource, and the runtime enforces
// keyed + identityTable at registration.

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
): CompiledQuery<Row, P> {
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

  const resolveWhere = (params: P): SQL | undefined =>
    typeof spec.where === "function" ? spec.where(params) : spec.where;
  // The declared wire encoding, applied to every row a loader returns.
  const encodeRow = spec.encodeRow;
  const encoded = (rows: Row[]): Row[] =>
    encodeRow
      ? rows.map((r) => encodeRow(r as Record<string, unknown>) as Row)
      : rows;

  const dependsOn: DependsOnEntry[] | undefined = spec.edges?.map((edge) =>
    compileEdge(edge, db),
  );

  if (spec.point) {
    const codec = (contract as PointQueryResourceContract<Row>).point;
    guard(
      codec,
      key,
      "spec declares `point` but the descriptor carries no point codec — declare it with pointQueryResourceDescriptor(...).",
    );
    guard(
      spec.orderBy === undefined && spec.signatureColumns === undefined,
      key,
      "`orderBy` / `signatureColumns` are meaningless with `point` — point sets are unordered (entrants append).",
    );
    guard(
      spec.identity?.pk === undefined || spec.identity.pk === spec.point.by,
      key,
      "`point.by` must BE the identity pk (the change-feed routes by intersecting changed identity ids with each tuple's set) — drop the redundant `identity.pk` or make them the same column.",
    );

    const { tableName, rel, pkColumn, keyField, selectMap } = resolveIdentity(
      spec.from,
      { table: spec.identity?.table, pk: spec.point.by },
      spec.select,
    );

    const from = (): QueryStep<Row> =>
      (selectMap ? db.select<Row>(selectMap) : db.select<Row>()).from(rel);

    const loader = async (
      params: P,
      ctx?: { affectedIds: readonly string[] },
    ): Promise<Row[]> => {
      const ids = ctx?.affectedIds ?? codec.decode(params);
      if (ids.length === 0) return [];
      const w = resolveWhere(params);
      const pred = inArray(pkColumn, [...ids]);
      return encoded(await from().where(w ? and(w, pred)! : pred));
    };

    const membership: KeyedMembership<P> = {
      kind: "point",
      idsOf: (params) => codec.decode(params),
    };

    // Annotated, not cast: the `as` on `serverOpts` below launders the spreads
    // and would hide a missing `ScopePolicy` arm, so the policy is built as its
    // own CHECKED value first. `membership` is this compiler's answer to "which
    // subscribed tuple owns a changed row" — the point set intersects the changed
    // identity ids — so it needs no `fanOut`.
    const scopePolicy: ScopePolicy<P> = {
      identityTable: tableName,
      membership,
    };

    const serverOpts = {
      loader,
      ...scopePolicy,
      ...(dependsOn ? { dependsOn } : {}),
      ...(spec.debounceMs != null ? { debounceMs: spec.debounceMs } : {}),
    } as ServerResourceOptions<Row[], P> & ScopePolicy<P>;
    return { serverOpts, keyField, identityTableName: tableName };
  }

  // Window kind.
  const codec = (contract as WindowQueryResourceContract<Row, P & WindowParams>)
    .window;
  guard(
    codec,
    key,
    "spec declares `window` but the descriptor carries no window codec — declare it with windowQueryResourceDescriptor(...).",
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

  const { tableName, rel, pkColumn, keyField, selectMap, columns } =
    resolveIdentity(spec.from, spec.identity, spec.select);

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
    "a function `orderBy` REQUIRES a non-empty `signatureColumns` — the union of every column it may sort by, so an UPDATE to any of them re-derives the window.",
  );

  // Order signature: the canonical join of the row's signature-column wire
  // values — the declared order columns for a static order, `signatureColumns`
  // when given (the auto pk tiebreaker is immutable, hence excluded). Always
  // emitted for the window kind — no opt-in surface: the runtime compares it
  // per refilled member row and re-derives the window (one bounded
  // `windowIdsOf`) when it moved, so an UPDATE that bumps an order column (a
  // `createdAt` resurface) reorders the wire window instead of leaving it
  // stale. Every signature column must therefore be projected — the signature
  // is computed over the wire row the loader returns.
  const signatureColumns: PgColumn[] =
    spec.signatureColumns ?? staticOrder!.map((k) => k.col);
  const covered = (col: PgColumn): boolean =>
    col === pkColumn ||
    signatureColumns.some((c) => c === col || c.name === col.name);
  // An order column outside the signature would reorder without the runtime
  // noticing — the tuple's order would go stale. Checked at module eval for a
  // static order, per resolved order for a function one.
  const assertCovered = (order: readonly WindowOrderKey[]): void => {
    for (const k of order) {
      guard(
        covered(k.col),
        key,
        `the order column "${k.col.name}" is not in \`signatureColumns\` — an UPDATE to it would leave the window's order stale. Add it to \`signatureColumns\`.`,
      );
    }
  };
  if (staticOrder) assertCovered(staticOrder);
  const orderFields = signatureColumns.map((col) => {
    const field = wireFieldFor(spec.select, columns, col);
    guard(
      field !== undefined,
      key,
      `the order column "${col.name}" is not projected — the window's order ` +
        `signature is derived from the wire row, so every declared order column ` +
        `must appear in \`select\`.`,
    );
    return field;
  });
  const orderSignatureOf = (row: unknown): string =>
    orderFields
      .map(
        (f) =>
          JSON.stringify((row as Record<string, unknown>)[f]) ?? "undefined",
      )
      .join("\u0000");

  // Declared order keys + the pk tiebreaker (skipped when a key already targets
  // the pk column — same rule as keyset's `buildSortKeys`), rendered with
  // explicit NULLS LAST so a future cursor's seek stays symmetric.
  const renderOrder = (declared: readonly WindowOrderKey[]): SQL[] => {
    const keys: SortKey[] = declared.map((k) => ({
      fieldId: k.col.name,
      col: k.col,
      dir: k.dir ?? "asc",
      nullable: k.nullable ?? false,
    }));
    if (!keys.some((k) => k.col === pkColumn)) {
      keys.push({
        fieldId: pkColumn.name,
        col: pkColumn,
        dir: "asc",
        nullable: false,
      });
    }
    return orderByClauses(keys);
  };
  const staticOrderSql = staticOrder ? renderOrder(staticOrder) : undefined;
  // Per-params order, memoized per canonical order. Bounded by the resolver's
  // own vocabulary (its sortable columns × directions), never by the params.
  const orderMemo = new Map<string, SQL[]>();
  const orderSqlOf = (params: P): SQL[] => {
    if (staticOrderSql) return staticOrderSql;
    const declared = orderFn!(params);
    const canonical = JSON.stringify(
      declared.map((k) => [k.col.name, k.dir ?? "asc", k.nullable ?? false]),
    );
    let rendered = orderMemo.get(canonical);
    if (!rendered) {
      assertCovered(declared);
      rendered = renderOrder(declared);
      orderMemo.set(canonical, rendered);
    }
    return rendered;
  };

  // The subscription's decoded limit, clamped — ONE helper feeds the loader AND
  // `windowIdsOf`, so the value the clients see and the membership authority can
  // never disagree about the window size.
  const limitOf = (params: P): number =>
    Math.min(codec.decode(params).limit, maxLimit);

  const from = (): QueryStep<Row> =>
    (selectMap ? db.select<Row>(selectMap) : db.select<Row>()).from(rel);

  // FULL loader = the windowed query — bounded by construction, so the runtime's
  // FULL branches (no snapshot, sticky-FULL, evicted-snapshot self-heal) can
  // never sweep the whole collection.
  function buildFull(params: P): QueryStep<Row> {
    let q = from();
    const w = resolveWhere(params);
    if (w) q = q.where(w);
    return q.orderBy(...orderSqlOf(params)).limit(limitOf(params));
  }

  // Scoped refill: `where ∧ pk IN affectedIds`, NO order/limit — a partial
  // refill of only the changed rows (the membership diff owns placement).
  function buildScoped(
    params: P,
    affectedIds: readonly string[],
  ): QueryStep<Row> {
    const w = resolveWhere(params);
    const pred = inArray(pkColumn, [...affectedIds]);
    return from().where(w ? and(w, pred)! : pred);
  }

  const loader = async (
    params: P,
    ctx?: { affectedIds: readonly string[] },
  ): Promise<Row[]> =>
    encoded(
      await (ctx ? buildScoped(params, ctx.affectedIds) : buildFull(params)),
    );

  // The ids-only bounded ordered id list — the membership authority. Same
  // where/order/limit as the FULL loader, projecting ONLY the pk.
  const windowIdsOf = async (params: P): Promise<string[]> => {
    let q: QueryStep<Record<string, unknown>> = db
      .select<Record<string, unknown>>({ [keyField]: pkColumn })
      .from(rel);
    const w = resolveWhere(params);
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
  const scopePolicy: ScopePolicy<P> = { identityTable: tableName, membership };

  const serverOpts = {
    loader,
    ...scopePolicy,
    ...(dependsOn ? { dependsOn } : {}),
    ...(spec.debounceMs != null ? { debounceMs: spec.debounceMs } : {}),
  } as ServerResourceOptions<Row[], P> & ScopePolicy<P>;
  return { serverOpts, keyField, identityTableName: tableName };
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
  if (descriptor.queryPk !== keyField) {
    throw new Error(
      `windowQueryResource("${descriptor.key}"): the descriptor's pkField ` +
        `"${descriptor.queryPk}" does not match the keyField "${keyField}" ` +
        `derived from the query's identity column. The descriptor's keyOf and the ` +
        `resource's identity must key on the same field — fix the pkField passed ` +
        `to the descriptor factory, or the identity/select in the spec.`,
    );
  }
  return defineResource(descriptor, serverOpts);
}

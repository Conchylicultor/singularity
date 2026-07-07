import { and, inArray, type SQL } from "drizzle-orm";
import { db as realDb } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import type {
  DependsOnEntry,
  Resource,
  ResourceParams,
  ScopePolicy,
  ServerResourceOptions,
} from "@plugins/framework/plugins/resource-runtime/core";
import type { QueryResourceContract } from "@plugins/infra/plugins/query-resource/core";
import { resolveIdentity } from "./identity";
import { compileEdge } from "./rel";
import type { Edge, QueryDb, QueryResourceSpec, QueryStep } from "./spec";

/** The compiled server half of a query-resource, ready for `defineResource`. */
export interface CompiledQuery<Row, P extends ResourceParams> {
  serverOpts: ServerResourceOptions<Row[], P> & ScopePolicy;
  keyField: string;
  /** The base table the identity scopes to, or `null` under `recompute: full`. */
  identityTableName: string | null;
}

/**
 * Turn a `QueryResourceSpec` into the two-arg `defineResource` server half:
 * the loader (full + Layer-2 scoped variants), the `ScopePolicy` (an
 * `identityTable` or the explicit `recompute` FULL opt-out), the compiled
 * `dependsOn` edges, and the derived client keyField. `mode` is never set —
 * keyed-ness comes solely from the contract, so the compiler only ever produces
 * keyed resources.
 */
export function compileQuery<Row, P extends ResourceParams = ResourceParams>(
  spec: QueryResourceSpec<P>,
): CompiledQuery<Row, P> {
  // M5: `scopedMembership` is incompatible with a windowed/LIMIT read (a row
  // entering/leaving the window is a membership change a per-id refill can't place)
  // and with the `recompute: { full }` opt-out (the opposite policy — no
  // identityTable to scope against). Both are declaration-time bugs → loud throw at
  // module eval, so a bad spec is a boot crash, never a silent misbehavior.
  if (spec.scopedMembership) {
    if (spec.limit != null) {
      throw new Error(
        "compileQuery: scopedMembership is incompatible with `limit` — a windowed " +
          "read cannot membership-scope (a row entering/leaving the window is a " +
          "membership change a per-id refill can't express). Use `recompute: { full }`.",
      );
    }
    if (spec.recompute != null) {
      throw new Error(
        "compileQuery: scopedMembership and `recompute` are mutually exclusive — " +
          "scopedMembership IS the incremental-membership policy, `recompute: { full }` " +
          "is the whole-set FULL opt-out. Pick one.",
      );
    }
  }

  // One boundary cast: the real drizzle `db` satisfies `QueryDb` structurally,
  // but its precise generics fight a plain assignment (the entities plugin sets
  // the `as unknown as` precedent at its own runtime/type boundary).
  const db: QueryDb = spec.db ?? (realDb as unknown as QueryDb);

  const { tableName, rel, pkColumn, keyField, selectMap } = resolveIdentity(
    spec.from,
    spec.identity,
    spec.select,
  );

  const orderBy: SQL[] | undefined =
    spec.orderBy == null
      ? undefined
      : Array.isArray(spec.orderBy)
        ? spec.orderBy
        : [spec.orderBy];

  const resolveWhere = (params: P): SQL | undefined =>
    typeof spec.where === "function" ? spec.where(params) : spec.where;

  const from = (): QueryStep =>
    (selectMap ? db.select(selectMap) : db.select()).from(rel);

  // FULL query: select + where + orderBy + limit.
  function buildFull(params: P): QueryStep {
    let q = from();
    const w = resolveWhere(params);
    if (w) q = q.where(w);
    if (orderBy) q = q.orderBy(...orderBy);
    if (spec.limit != null) q = q.limit(spec.limit);
    return q;
  }

  // Scoped refill: same select/where composed with `pk IN (affectedIds)` and
  // NO orderBy/limit — a partial refill of only the changed rows (a limit would
  // truncate it; the merge preserves the snapshot's order).
  function buildScoped(params: P, affectedIds: readonly string[]): QueryStep {
    const w = resolveWhere(params);
    const scopePred = inArray(pkColumn, [...affectedIds]);
    return from().where(w ? and(w, scopePred)! : scopePred);
  }

  // Scoped loads fire only under the identityTable policy; with `recompute:full`
  // the loader always runs the FULL query and ignores `ctx.affectedIds`.
  const scoped = spec.recompute === undefined;

  const loader = (
    params: P,
    ctx?: { affectedIds: readonly string[] },
  ): Promise<Row[]> => {
    const query =
      ctx?.affectedIds && scoped ? buildScoped(params, ctx.affectedIds) : buildFull(params);
    // The step is a `PromiseLike<unknown[]>`; the runtime awaits it and validates
    // the rows against the resource schema (mirrors the hand-written loaders).
    return query as unknown as Promise<Row[]>;
  };

  // M5 orderOf: the ids-only "full ORDER BY'd id list for these params" query the
  // runtime runs ONLY when a refill returns a row that entered membership (needs
  // authoritative placement). Same select→from→where→orderBy shape as the FULL
  // loader but projecting ONLY the pk (never a limit), through the same `QueryDb`
  // seam so it is fake-db unit-testable. Rows map to `String(row[keyField])`.
  const orderOf = async (params: P): Promise<string[]> => {
    let q: QueryStep = db.select({ [keyField]: pkColumn }).from(rel);
    const w = resolveWhere(params);
    if (w) q = q.where(w);
    if (orderBy) q = q.orderBy(...orderBy);
    const rows = (await q) as Record<string, unknown>[];
    return rows.map((r) => String(r[keyField]));
  };

  const dependsOn: DependsOnEntry[] | undefined = spec.edges?.map((edge) =>
    compileEdge(edge, db),
  );

  const scopePolicy: ScopePolicy = spec.recompute
    ? { recompute: spec.recompute }
    : { identityTable: tableName };

  const serverOpts = {
    loader,
    ...(dependsOn ? { dependsOn } : {}),
    ...(spec.debounceMs != null ? { debounceMs: spec.debounceMs } : {}),
    ...(spec.scopedMembership ? { scopedMembership: { orderOf } } : {}),
    ...scopePolicy,
  } as ServerResourceOptions<Row[], P> & ScopePolicy;

  return { serverOpts, keyField, identityTableName: scoped ? tableName : null };
}

/**
 * Compile `rel()` edges into `dependsOn` entries for a HAND-WRITTEN
 * `defineResource` — the derived-scoping analogue for resources that keep a
 * bespoke loader (attempts' nested conversation join, agent-launches' rollup
 * join) yet want their cascade edges derived rather than hand-rolled. `db`
 * defaults to the real per-worktree drizzle `db` (unit tests inject a fake).
 *
 * The `as DependsOnEntry<P>[]` is the same generic laundering `compileQuery`
 * does when it folds edges into `serverOpts.dependsOn`: `compileEdge` never
 * sets `map` (only `affectedMap`/`signature`), which are `P`-independent, so a
 * `DependsOnEntry` (default `P`) is a sound `DependsOnEntry<P>` for any `P`.
 */
export function compileEdges<P extends ResourceParams = ResourceParams>(
  edges: Edge[],
  db: QueryDb = realDb as unknown as QueryDb,
): DependsOnEntry<P>[] {
  return edges.map((edge) => compileEdge(edge, db)) as DependsOnEntry<P>[];
}

/**
 * Compile `spec` and register the keyed resource against the shared client
 * descriptor. Asserts the descriptor's `queryPk` equals the derived keyField —
 * a LOUD throw at module evaluation (boot crash) if the descriptor and the
 * query key on different columns, so the mismatch can never reach the client.
 */
export function queryResource<Row, P extends ResourceParams = ResourceParams>(
  descriptor: QueryResourceContract<Row, P>,
  spec: QueryResourceSpec<P>,
): Resource<Row[], P> {
  const { serverOpts, keyField } = compileQuery<Row, P>(spec);
  if (descriptor.queryPk !== keyField) {
    throw new Error(
      `queryResource("${descriptor.key}"): the descriptor's pkField ` +
        `"${descriptor.queryPk}" does not match the keyField "${keyField}" ` +
        `derived from the query's identity column. The descriptor's keyOf and the ` +
        `resource's identity must key on the same field — fix the pkField passed ` +
        `to queryResourceDescriptor(...), or the identity/select in the spec.`,
    );
  }
  return defineResource(descriptor, serverOpts);
}

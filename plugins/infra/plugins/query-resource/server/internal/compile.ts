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
import type { QueryDb, QueryResourceSpec, QueryStep } from "./spec";

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
    ...scopePolicy,
  } as ServerResourceOptions<Row[], P> & ScopePolicy;

  return { serverOpts, keyField, identityTableName: scoped ? tableName : null };
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

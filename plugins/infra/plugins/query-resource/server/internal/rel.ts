import { inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type {
  DependsOnEntry,
  Resource,
  ResourceParams,
} from "@plugins/framework/plugins/resource-runtime/core";
import type { Edge, QueryDb } from "./spec";

/**
 * Declare a cross-resource cascade edge: when `upstream` notifies, translate the
 * changed upstream row ids into THIS resource's changed ids by reading the FK
 * column. Mirrors the hand-written attempts↔conversations closure:
 *
 *   affectedMap = ids =>
 *     db.selectDistinct({ fk }).from(upstreamTable)
 *       .where(inArray(upstreamPk, [...ids]))
 *       .map(r => String(r.fk))
 *
 * Compiled into a `dependsOn` entry now (via `compileEdge`); load-bearing from M4
 * on. `opts.signature` is passed through verbatim (the relevance gate that drops
 * a cascade whose downstream-relevant upstream projection is unchanged).
 */
export function rel<T, P extends ResourceParams>(
  upstream: Resource<T, P>,
  upstreamTable: PgTable,
  keys: { fk: PgColumn; upstreamPk: PgColumn },
  opts?: { signature?: DependsOnEntry["signature"] },
): Edge {
  return {
    // P is contravariant on `load`, so a concrete resource is not structurally a
    // `Resource<unknown, ResourceParams>`; the erasure is safe (the runtime only
    // reads `.key`) and localized to this one cast.
    upstream: upstream as unknown as Resource<unknown, ResourceParams>,
    upstreamTable,
    fk: keys.fk,
    upstreamPk: keys.upstreamPk,
    signature: opts?.signature,
  };
}

/** Fold an `Edge` into the `dependsOn` entry the resource runtime consumes. */
export function compileEdge(edge: Edge, db: QueryDb): DependsOnEntry {
  return {
    resource: edge.upstream,
    signature: edge.signature,
    affectedMap: async (ids) => {
      const rows = await db
        .selectDistinct({ fk: edge.fk })
        .from(edge.upstreamTable)
        .where(inArray(edge.upstreamPk, [...ids]));
      return rows.map((r) => String((r as { fk: unknown }).fk));
    },
  };
}

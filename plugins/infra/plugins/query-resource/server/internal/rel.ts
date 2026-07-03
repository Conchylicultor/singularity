import { inArray } from "drizzle-orm";
import type {
  DependsOnEntry,
  Resource,
  ResourceParams,
} from "@plugins/framework/plugins/resource-runtime/core";
import type { Edge, Hop, QueryDb } from "./spec";

/**
 * Declare a cross-resource cascade edge: when `upstream` notifies, translate the
 * changed upstream row ids into THIS resource's changed ids by chaining `hops`.
 * A single hop reproduces the hand-written attempts↔conversations closure:
 *
 *   rel(conversationsActive,
 *       { via: _conversations, from: _conversations.id, to: _conversations.attemptId })
 *   ⇒ affectedMap = ids =>
 *        db.selectDistinct({ v: attemptId }).from(_conversations)
 *          .where(inArray(id, [...ids])).map(r => String(r.v))
 *
 * A multi-table mapping (conversation → task → launch) passes a hop array; each
 * hop's distinct `to` values feed the next hop's `from IN (…)`. Compiled into a
 * `dependsOn` entry via `compileEdge`. `opts.signature` is passed through
 * verbatim (the relevance gate that drops a cascade whose downstream-relevant
 * upstream projection is unchanged).
 */
export function rel<T, P extends ResourceParams>(
  upstream: Resource<T, P>,
  hops: Hop | Hop[],
  opts?: { signature?: DependsOnEntry["signature"] },
): Edge {
  return {
    // P is contravariant on `load`, so a concrete resource is not structurally a
    // `Resource<unknown, ResourceParams>`; the erasure is safe (the runtime only
    // reads `.key`) and localized to this one cast.
    upstream: upstream as unknown as Resource<unknown, ResourceParams>,
    hops: Array.isArray(hops) ? hops : [hops],
    signature: opts?.signature,
  };
}

/**
 * Fold an `Edge` into the `dependsOn` entry the resource runtime consumes. The
 * `affectedMap` threads the changed id set through the hop chain, one
 * `selectDistinct` per hop, `String()`-coercing and deduping the ids between
 * hops. An empty hop short-circuits the whole chain to `[]` with no further
 * query — sound because the runtime never calls `affectedMap` with an empty set
 * (`runtime.ts`), so an empty result can only mean "no downstream rows".
 */
export function compileEdge(edge: Edge, db: QueryDb): DependsOnEntry {
  return {
    resource: edge.upstream,
    signature: edge.signature,
    affectedMap: async (ids) => {
      let current: string[] = [...ids];
      for (const hop of edge.hops) {
        if (current.length === 0) return [];
        const rows = await db
          .selectDistinct({ v: hop.to })
          .from(hop.via)
          .where(inArray(hop.from, current));
        current = [
          ...new Set(rows.map((r) => String((r as { v: unknown }).v))),
        ];
      }
      return current;
    },
  };
}

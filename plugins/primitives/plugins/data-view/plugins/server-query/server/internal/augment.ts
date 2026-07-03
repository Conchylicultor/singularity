import type { AnyColumn } from "drizzle-orm";
import type { PgColumn, PgSelect } from "drizzle-orm/pg-core";
import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import { readDataViewConfigDoc } from "@plugins/primitives/plugins/data-view/server";
import type {
  SortRule,
  FilterGroup,
} from "@plugins/primitives/plugins/data-view/core";
import type { FieldColumnMap } from "./compile";

/**
 * The context handed to every registered `QueryAugmentor` at request time. It
 * carries the surface coordinates (`dataViewId` + the base `rowKeyCol` whose
 * value equals the web `rowKey(row)`), the active `sort`/`filter`, and the parsed
 * config doc for the surface. `config` is passed OPAQUELY — server-query never
 * reads its shape; each augmentor interprets the keys it owns (custom-columns
 * reads `config.customColumns`).
 *
 * **Row-key invariant.** The join an augmentor builds matches its side-table's
 * row key against `rowKeyCol::text`, so it is correct only when the consumer's
 * web `rowKey(row)` equals the value of the `rowKeyCol` it passes. A mismatch
 * yields all-NULL augmented values (fail-soft, never a crash).
 */
export interface QueryAugmentorContext {
  dataViewId: string;
  rowKeyCol: AnyColumn;
  sort: SortRule[];
  filter: FilterGroup | null;
  config: Record<string, unknown>;
}

/**
 * A single dynamic join an augmentor contributes. `apply` takes and returns the
 * erased `$dynamic()` builder (`PgSelect`) — the drizzle dynamic-query
 * composition pattern (`q = q.leftJoin(...)`). It is deliberately NOT generic
 * over `Q extends PgSelect`: `leftJoin` widens the selection, so its result is
 * not provably the *same* `Q`, but it IS assignable back to the broad `PgSelect`.
 */
export interface DataViewJoin {
  apply: (q: PgSelect) => PgSelect;
}

/**
 * The merged output of one augmentor: `columnMap` binds each augmented field id to
 * its aliased physical column (dropped straight into the consumer's `FieldColumnMap`),
 * `joins` are the dynamic `leftJoin`s that materialize those columns, and
 * `projection` adds the aliased columns the keyset cursor must read (sort keys only).
 */
export interface ServerQueryAugmentation {
  columnMap: FieldColumnMap;
  joins: DataViewJoin[];
  // `PgColumn` (not the broad `AnyColumn`) so the consumer can spread these
  // straight into a drizzle `.select({...})` (whose `SelectedFields` values are
  // pg columns / SQL).
  projection: Record<string, PgColumn>;
}

/**
 * A server-side field-extension augmentor — the server twin of the web global
 * `DataViewSlots.FieldExtension` slot. Given the surface context + parsed config,
 * it returns the join(s) + `FieldColumnMap` bindings + projection needed to make
 * its extra fields participate in server-side sort/filter/keyset. Registered via
 * `DataViewServer.QueryAugmentor`; folded generically by `augmentServerQuery`.
 */
export type QueryAugmentor = (
  ctx: QueryAugmentorContext,
) => ServerQueryAugmentation | Promise<ServerQueryAugmentation>;

/**
 * The generic server-contribution registry (the server twin of the web global
 * `FieldExtension` slot). A contributor wraps its augmentor in `{ augment }` (a
 * bare function is lost by the token's props-spread, so it MUST be carried on an
 * object). No eager self-registering wrapper is needed — augmentors are only read
 * at request time, well after `collectContributions`, so the plain live registry
 * suffices.
 */
export const DataViewServer = {
  QueryAugmentor: defineServerContribution<{ augment: QueryAugmentor }>(
    "data-view.query-augmentor",
  ),
};

const EMPTY: ServerQueryAugmentation = {
  columnMap: {},
  joins: [],
  projection: {},
};

/** Spread-merge `columnMap`/`projection`, concat `joins`, across every augmentor. */
function mergeAugmentations(
  results: ServerQueryAugmentation[],
): ServerQueryAugmentation {
  const merged: ServerQueryAugmentation = {
    columnMap: {},
    joins: [],
    projection: {},
  };
  for (const r of results) {
    Object.assign(merged.columnMap, r.columnMap);
    merged.joins.push(...r.joins);
    Object.assign(merged.projection, r.projection);
  }
  return merged;
}

/**
 * Fold every registered `QueryAugmentor` for one server-delegated DataView query.
 * The caller passes everything EXCEPT `config`; this reads the surface's config
 * doc once (by `dataViewId`, via data-view's `readDataViewConfigDoc`) and injects
 * it into every augmentor, then merges the results. When no augmentor is
 * registered it returns an empty augmentation WITHOUT reading config, so a plain
 * server DataView pays nothing.
 *
 * Consumers merge `aug.columnMap` into their base `FieldColumnMap`, apply
 * `aug.joins` to a `$dynamic()` query, add `aug.projection` to the selection, and
 * run the existing `server-query` pipeline unchanged.
 */
export async function augmentServerQuery(
  ctx: Omit<QueryAugmentorContext, "config">,
): Promise<ServerQueryAugmentation> {
  const augmentors = DataViewServer.QueryAugmentor.getContributions();
  if (augmentors.length === 0) return EMPTY;
  const config = readDataViewConfigDoc(ctx.dataViewId);
  const results = await Promise.all(
    // `Promise.resolve` so a synchronous augmentor (the common case) is still a
    // thenable for the aggregator (satisfies `await-thenable`).
    augmentors.map((a) => Promise.resolve(a.augment({ ...ctx, config }))),
  );
  return mergeAugmentations(results);
}

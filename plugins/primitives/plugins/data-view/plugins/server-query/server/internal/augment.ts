import type { AnyColumn } from "drizzle-orm";
import type { PgColumn, PgSelect } from "drizzle-orm/pg-core";
import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import { readDataViewConfigDoc } from "@plugins/primitives/plugins/data-view/server";
import type { SortRule } from "@plugins/primitives/plugins/data-view/core";
import {
  filterColumns,
  type Filter,
  type FilterColumn,
  type Filterable,
} from "@plugins/network/plugins/live/plugins/filter/core";
import {
  decodeFilterBody,
  filterableOf,
  type ColumnBinding,
  type FieldColumnMap,
} from "./compile";

/**
 * The context handed to every registered `QueryAugmentor` at request time: the
 * surface coordinates (`dataViewId` + the base `rowKeyCol` whose value equals
 * the web `rowKey(row)`) and the parsed config doc for the surface. `config` is
 * passed OPAQUELY — server-query never reads its shape; each augmentor
 * interprets the keys it owns (custom-columns reads `config.customColumns`).
 *
 * **Row-key invariant.** The join an augmentor builds matches its side-table's
 * row key against `rowKeyCol::text`, so it is correct only when the consumer's
 * web `rowKey(row)` equals the value of the `rowKeyCol` it passes. A mismatch
 * yields all-NULL augmented values (fail-soft, never a crash).
 */
export interface QueryAugmentorContext {
  dataViewId: string;
  rowKeyCol: AnyColumn;
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
 * One column an augmentor OFFERS: its binding (the domain it is filtered in, and
 * the SQL it reads — valid only once `join` is applied) and the join that
 * materializes it. An augmentor offers every column it could serve; the fold
 * joins only the ones the request's sort or filter names, so an unused column
 * costs nothing.
 */
export interface AugmentedColumn {
  binding: ColumnBinding;
  join: DataViewJoin;
}

/**
 * The merged output for one request: the decoded `filter`, the base map plus
 * every REFERENCED augmented column (`columnMap`), the `joins` that materialize
 * those, and the `projection` of the augmented sort keys the keyset cursor must
 * read.
 */
export interface ServerQueryAugmentation {
  filter: Filter | undefined;
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
 * it offers the extra columns it can serve (column id → {@link AugmentedColumn}).
 * Registered via `DataViewServer.QueryAugmentor`; folded generically by
 * `augmentServerQuery`.
 */
export type QueryAugmentor = (
  ctx: QueryAugmentorContext,
) => Record<string, AugmentedColumn> | Promise<Record<string, AugmentedColumn>>;

/**
 * The generic server-contribution registry (the server twin of the web global
 * `FieldExtension` slot). A contributor wraps its augmentor in `{ augment }` (a
 * bare function is lost by the token's props-spread, so it MUST be carried on an
 * object). Augmentors are only read at request time, well after
 * `collectContributions`, so the plain live registry suffices.
 */
export const DataViewServer = {
  QueryAugmentor: defineServerContribution<{ augment: QueryAugmentor }>(
    "data-view.query-augmentor",
  ),
};

/**
 * Decode one server-delegated DataView query's filter and fold every registered
 * `QueryAugmentor` into its column map.
 *
 * 1. Every augmentor offers its columns (config read once, by `dataViewId`).
 * 2. The body's wire `filter` is decoded STRICTLY against the base map's
 *    columns plus every offered column — an unknown column is a 400.
 * 3. Only the offered columns the filter or `sort` references are joined and
 *    bound; the augmented sort keys are projected for the keyset cursor.
 *
 * A base column id wins over an offered one of the same id. With no augmentor
 * registered it reads no config and only decodes.
 */
export async function augmentServerQuery(args: {
  dataViewId: string;
  rowKeyCol: AnyColumn;
  sort: SortRule[];
  /** The body's wire filter (the canonical tree the DataView host sent), undecoded. */
  filter: unknown;
  /** The source's own bound columns (`bindColumns(<core filterable>, …)`). */
  columnMap: FieldColumnMap;
}): Promise<ServerQueryAugmentation> {
  const augmentors = DataViewServer.QueryAugmentor.getContributions();
  const offered: Record<string, AugmentedColumn> = {};
  if (augmentors.length > 0) {
    const config = readDataViewConfigDoc(args.dataViewId);
    const ctx: QueryAugmentorContext = {
      dataViewId: args.dataViewId,
      rowKeyCol: args.rowKeyCol,
      config,
    };
    const results = await Promise.all(
      // `Promise.resolve` so a synchronous augmentor (the common case) is still
      // a thenable for the aggregator (satisfies `await-thenable`).
      augmentors.map((a) => Promise.resolve(a.augment(ctx))),
    );
    for (const r of results) {
      for (const [id, col] of Object.entries(r)) {
        if (!Object.hasOwn(args.columnMap, id)) offered[id] = col;
      }
    }
  }

  const filterable: Record<string, FilterColumn> = {
    ...filterableOf(args.columnMap),
  };
  for (const [id, col] of Object.entries(offered)) {
    filterable[id] = { domain: col.binding.domain };
  }
  const declared: Filterable = filterable;
  const filter = decodeFilterBody(args.filter, declared);

  const sortIds = new Set(args.sort.map((r) => r.fieldId));
  const referenced = filterColumns(filter);
  for (const id of sortIds) referenced.add(id);

  const columnMap: FieldColumnMap = { ...args.columnMap };
  const joins: DataViewJoin[] = [];
  const projection: Record<string, PgColumn> = {};
  for (const [id, col] of Object.entries(offered)) {
    if (!referenced.has(id)) continue;
    columnMap[id] = col.binding;
    joins.push(col.join);
    // The projection is typed `PgColumn` so consumers can spread it into a
    // drizzle `.select({...})`; an augmented binding may be a cast `SQL`, which
    // is runtime-safe there (it is only ever selected).
    if (sortIds.has(id))
      projection[id] = col.binding.col as unknown as PgColumn;
  }
  return { filter, columnMap, joins, projection };
}

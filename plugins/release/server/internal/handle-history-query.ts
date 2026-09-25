import { runtimeNamespace } from "@plugins/infra/plugins/runtime-identity/core";
import { and, eq, type SQL } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { SortRule } from "@plugins/primitives/plugins/data-view/core";
import {
  augmentServerQuery,
  bindColumns,
  compileWhere,
  type FieldColumnMap,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import {
  buildSortKeys,
  keyValuesOf,
  orderByClauses,
  seekPredicate,
} from "@plugins/primitives/plugins/keyset/server";
import {
  decodeCursor,
  encodeCursor,
  sortSignature,
} from "@plugins/primitives/plugins/keyset/core";
import type { ReleaseRun } from "../../core";
import { queryReleaseHistory, RELEASE_HISTORY_FILTERABLE } from "../../core";
import { _releaseRuns } from "./tables";
// The public wire projection — every `release_runs` column EXCEPT `pid`, shared
// with the per-id resource and the candidate endpoint so a new column reaches
// all three. `release_runs` is a plain `pgTable` (not a `pgView`), so we spread
// it — not the `viewColumns(view)` symbol hack the conversations handler needs
// for its `pgView` source — and add the augmentors' join columns alongside it.
import { RELEASE_RUN_WIRE_COLUMNS } from "./wire-columns";

// Binds every RELEASE_HISTORY_FILTERABLE column → its `release_runs` column
// (domain copied from the declaration; a declared column with no binding is a
// tsc error), with `nullable` for the null-aware keyset seek. A filter naming
// anything else is refused with a 400 — never dropped.
const COLUMN_MAP: FieldColumnMap = bindColumns(RELEASE_HISTORY_FILTERABLE, {
  composition: { col: _releaseRuns.composition },
  target: { col: _releaseRuns.target },
  status: { col: _releaseRuns.status },
  platform: { col: _releaseRuns.platform, nullable: true },
  startedAt: { col: _releaseRuns.startedAt },
  finishedAt: { col: _releaseRuns.finishedAt, nullable: true },
});

// Default order when the client sends no sort: newest run first.
const DEFAULT_SORT: SortRule[] = [{ fieldId: "startedAt", direction: "desc" }];

export const handleHistoryQuery = implement(
  queryReleaseHistory,
  async ({ body }) => {
    const { cursor, limit } = body;
    // Substitute the default order when the client sends no sort, and use the same
    // effective sort everywhere (keys, signature, augmentors) so cursors stay
    // consistent across pages.
    const sort = body.sort.length > 0 ? body.sort : DEFAULT_SORT;

    // Decode the filter strictly (400 on anything undeclared) and fold in the
    // generic server-side augmentors (custom columns, …): the referenced ones
    // bind their aliased columns into `columnMap` (so sort/filter/seek reach
    // them), a `LEFT JOIN` thunk, and a projection (so `keyValuesOf` can mint
    // the cursor).
    // `rowKeyCol` must be the column whose value == the web `rowKey(row)` (here
    // `_releaseRuns.id`, matching `rowKey={r => r.id}`).
    const aug = await augmentServerQuery({
      dataViewId: body.dataViewId,
      rowKeyCol: _releaseRuns.id,
      sort,
      filter: body.filter,
      columnMap: COLUMN_MAP,
    });
    const columnMap = aug.columnMap;

    // Always append PK `id asc` as a total-order tiebreaker so the keyset seek is
    // strict (gap-free / dup-free) even across the NULLS-LAST boundary.
    const keys = buildSortKeys(sort, columnMap, {
      col: _releaseRuns.id,
      fieldId: "id",
    });

    let seek: SQL | undefined;
    if (cursor) {
      const payload = decodeCursor(cursor);
      // Backstop: a cursor minted under a different sort must not be replayed
      // against this request's ordering (would dup/skip rows).
      if (payload.s !== sortSignature(sort)) {
        throw new HttpError(400, "Cursor sort signature mismatch");
      }
      seek = seekPredicate(keys, payload.v);
    }

    const where = and(
      // Scoped to this namespace's own runs: a worktree DB inherits main's rows via
      // the fork, so without this filter every worktree would surface main's runs.
      eq(_releaseRuns.namespace, runtimeNamespace()),
      eq(_releaseRuns.composition, body.composition),
      compileWhere(aug.filter, columnMap),
      seek,
    );

    // Explicit flat projection (wire columns + the augmentors' sort-key columns)
    // over a `$dynamic()` query so the augmentors' joins can be applied.
    let q: PgSelect = db
      .select({ ...RELEASE_RUN_WIRE_COLUMNS, ...aug.projection })
      .from(_releaseRuns)
      .$dynamic();
    for (const j of aug.joins) q = j.apply(q);
    const rows = await q
      .where(where)
      .orderBy(...orderByClauses(keys))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const rawItems = rows.slice(0, limit);

    // Compute the cursor from the RAW last row — it still carries the custom
    // projection keys `keyValuesOf` reads to mint the keyset cursor.
    const lastRaw = rawItems.at(-1);
    const nextCursor =
      hasMore && lastRaw
        ? encodeCursor(
            keyValuesOf(lastRaw as unknown as Record<string, unknown>, keys),
            sortSignature(sort),
          )
        : null;

    // Strip the custom projection keys before returning (mirrors the conversations
    // handler): `ReleaseRunSchema` strips unknown keys anyway, but doing it here
    // keeps the wire lean and the shape explicit.
    const ccKeys = Object.keys(aug.projection);
    const items = rawItems.map((r) => {
      const c = { ...r } as Record<string, unknown>;
      for (const k of ccKeys) delete c[k];
      return c;
    }) as unknown as ReleaseRun[];

    return { items, nextCursor, hasMore };
  },
);

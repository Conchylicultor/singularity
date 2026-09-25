import { and, type SQL } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";
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
import { queryReports, REPORTS_FILTERABLE, type Report } from "../../core";
import { _reports } from "./tables";

// Binds every REPORTS_FILTERABLE column → its `reports` column (domain copied
// from the declaration; a declared column with no binding is a tsc error). The
// Reports DataView (plugins/debug/plugins/reports/web/components/reports-view.tsx)
// offers exactly the declared fields its schema has, and a filter naming
// anything else is refused with a 400 — never dropped.
const COLUMN_MAP: FieldColumnMap = bindColumns(REPORTS_FILTERABLE, {
  kind: { col: _reports.kind },
  source: { col: _reports.source },
  noise: { col: _reports.noise },
  rateLimited: { col: _reports.rateLimited },
  count: { col: _reports.count },
  lastSeenAt: { col: _reports.lastSeenAt },
  message: { col: _reports.message },
  fingerprint: { col: _reports.fingerprint },
});

// Default order when the client sends no sort: most recently seen first — the
// `reports_last_seen_idx` (last_seen_at, id) index covers it.
const DEFAULT_SORT: SortRule[] = [{ fieldId: "lastSeenAt", direction: "desc" }];

export const handleQueryReports = implement(queryReports, async ({ body }) => {
  const { cursor, limit } = body;
  // One effective sort everywhere (keys, signature, augmentors) so cursors stay
  // consistent across pages.
  const sort = body.sort.length > 0 ? body.sort : DEFAULT_SORT;

  // Strict filter decode (400 on anything undeclared) + the generic server-side
  // augmentors (custom columns, …): referenced aliased columns into `columnMap`,
  // a LEFT JOIN thunk, and a projection `keyValuesOf` reads to mint the cursor.
  // `rowKeyCol` is the column whose value == the web `rowKey(row)`.
  const aug = await augmentServerQuery({
    dataViewId: body.dataViewId,
    rowKeyCol: _reports.id,
    sort,
    filter: body.filter,
    columnMap: COLUMN_MAP,
  });
  const columnMap = aug.columnMap;

  // PK `id` as a total-order tiebreaker so the keyset seek is strict.
  const keys = buildSortKeys(sort, columnMap, {
    col: _reports.id,
    fieldId: "id",
  });

  let seek: SQL | undefined;
  if (cursor) {
    const payload = decodeCursor(cursor);
    // A cursor minted under a different sort must not be replayed against this
    // request's ordering (would dup/skip rows).
    if (payload.s !== sortSignature(sort)) {
      throw new HttpError(400, "Cursor sort signature mismatch");
    }
    seek = seekPredicate(keys, payload.v);
  }

  const where = and(compileWhere(aug.filter, columnMap), seek);

  let q: PgSelect = db
    .select({ ...getTableColumns(_reports), ...aug.projection })
    .from(_reports)
    .$dynamic();
  for (const j of aug.joins) q = j.apply(q);
  const rows = await q
    .where(where)
    .orderBy(...orderByClauses(keys))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const rawItems = rows.slice(0, limit);

  const lastRaw = rawItems.at(-1);
  const nextCursor =
    hasMore && lastRaw
      ? encodeCursor(
          keyValuesOf(lastRaw as unknown as Record<string, unknown>, keys),
          sortSignature(sort),
        )
      : null;

  // Strip the augmentors' projection keys: the wire is exactly a report row.
  const ccKeys = Object.keys(aug.projection);
  const items = rawItems.map((r) => {
    const c = { ...r } as Record<string, unknown>;
    for (const k of ccKeys) delete c[k];
    return c;
  }) as unknown as Report[];

  return { items, nextCursor, hasMore };
});

import { ilike, or, and, type SQL } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { resolveFieldFilterSql } from "@plugins/fields/plugins/server-capabilities/server";
import type { SortRule } from "@plugins/primitives/plugins/data-view/core";
import {
  augmentServerQuery,
  compileWhere,
  type FieldColumnMap,
  type OperatorSqlResolver,
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
import { queryReports, type Report } from "../../core";
import { _reports } from "./tables";

// Binds each filterable/sortable fieldId of the Reports DataView
// (plugins/debug/plugins/reports/web/components/reports-view.tsx) to its
// physical `reports` column, with the field-type token (resolving the
// operator→SQL builder). The keys MUST equal the web field ids — an unmapped
// filter/sort field is dropped fail-soft by the compiler, never a 400, so a
// mismatch silently stops that field from sorting or filtering.
const COLUMN_MAP: FieldColumnMap = {
  kind: { col: _reports.kind, type: "enum" },
  source: { col: _reports.source, type: "enum" },
  noise: { col: _reports.noise, type: "bool" },
  rateLimited: { col: _reports.rateLimited, type: "bool" },
  count: { col: _reports.count, type: "int" },
  lastSeenAt: { col: _reports.lastSeenAt, type: "date" },
};

// Default order when the client sends no sort: most recently seen first — the
// `reports_last_seen_idx` (last_seen_at, id) index covers it.
const DEFAULT_SORT: SortRule[] = [{ fieldId: "lastSeenAt", direction: "desc" }];

// Escape LIKE wildcards so a user search term is matched literally (backslash is
// Postgres ILIKE's default escape char).
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Quick search: ILIKE over message / kind / fingerprint. Blank query → undefined.
function searchWhere(query: string): SQL | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const needle = `%${escapeLike(trimmed)}%`;
  return or(
    ilike(_reports.message, needle),
    ilike(_reports.kind, needle),
    ilike(_reports.fingerprint, needle),
  );
}

// Field-type-agnostic: the SQL for each (type, operator) pair comes from the
// fields registry; an unknown pair resolves to `null` → that rule is dropped.
const resolver: OperatorSqlResolver = (typeId, operatorId) =>
  resolveFieldFilterSql(typeId, operatorId) ?? null;

export const handleQueryReports = implement(queryReports, async ({ body }) => {
  const { filter, query, cursor, limit } = body;
  // One effective sort everywhere (keys, signature, augmentors) so cursors stay
  // consistent across pages.
  const sort = body.sort.length > 0 ? body.sort : DEFAULT_SORT;

  // Generic server-side augmentors (custom columns, …): aliased columns into
  // `columnMap`, a LEFT JOIN thunk, and a projection `keyValuesOf` reads to mint
  // the cursor. `rowKeyCol` is the column whose value == the web `rowKey(row)`.
  const aug = await augmentServerQuery({
    dataViewId: body.dataViewId,
    rowKeyCol: _reports.id,
    sort,
    filter,
  });
  const columnMap = { ...COLUMN_MAP, ...aug.columnMap };

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

  const where = and(
    searchWhere(query),
    compileWhere(filter, columnMap, resolver),
    seek,
  );

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

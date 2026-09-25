import { and, ne, type SQL } from "drizzle-orm";
import type { PgColumn, PgSelect } from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  augmentServerQuery,
  compileWhere,
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
import { conversationsView as conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { queryConversations } from "../../core";
import { COLUMN_MAP } from "./column-map";

// drizzle has no public "columns of a view" getter (`getTableColumns` accepts a
// `Table` only). A `pgView` stores its aliased column bag under the stable global
// `ViewBaseConfig` symbol — the exact set drizzle itself selects for `.from(view)`.
// Spreading it reproduces the flat all-columns projection so we can add the
// augmentors' join columns alongside; a bare `.select()` with joins would instead
// nest the row shape by source table.
const VIEW_BASE_CONFIG = Symbol.for("drizzle:ViewBaseConfig");
function viewColumns(view: unknown): Record<string, PgColumn> {
  const cfg = (
    view as Record<
      symbol,
      { selectedFields: Record<string, PgColumn> } | undefined
    >
  )[VIEW_BASE_CONFIG];
  if (!cfg) throw new Error("viewColumns: value is not a drizzle view");
  return cfg.selectedFields;
}

export const handleQuery = implement(queryConversations, async ({ body }) => {
  const { sort, cursor, limit } = body;

  // Decode the filter strictly (400 on anything undeclared) and fold in the
  // generic server-side augmentors (custom columns, …): the referenced ones bind
  // their aliased columns into `columnMap` (so sort/filter/seek reach them), a
  // `LEFT JOIN` thunk, and a projection (so `keyValuesOf` can mint the cursor).
  // The consumer names no contributor — this is the server twin of the web
  // global `FieldExtension` slot. `rowKeyCol` must be the column whose value ==
  // the web `rowKey(row)` (here `conversations.id`, matching `rowKey={c => c.id}`).
  const aug = await augmentServerQuery({
    dataViewId: body.dataViewId,
    rowKeyCol: conversations.id,
    sort,
    filter: body.filter,
    columnMap: COLUMN_MAP,
  });
  const columnMap = aug.columnMap;

  // Always append PK `id asc` as a total-order tiebreaker so the keyset seek is
  // strict (gap-free / dup-free) even across the NULLS-LAST boundary.
  const keys = buildSortKeys(sort, columnMap, {
    col: conversations.id,
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
    body.includeSystem ? undefined : ne(conversations.kind, "system"),
    compileWhere(aug.filter, columnMap),
    seek,
  );

  // Explicit flat projection (base columns + the augmentors' sort-key columns)
  // over a `$dynamic()` query so the augmentors' joins can be applied.
  let q: PgSelect = db
    .select({ ...viewColumns(conversations), ...aug.projection })
    .from(conversations)
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

  // Strip the custom projection keys before returning: `ConversationSchema` is a
  // strict entity-derived zod object and would reject unknown `cc-*` keys.
  const ccKeys = Object.keys(aug.projection);
  const items = rawItems.map((r) => {
    const c = { ...r } as Record<string, unknown>;
    for (const k of ccKeys) delete c[k];
    return c;
  }) as unknown as Conversation[];

  return { items, nextCursor, hasMore };
});

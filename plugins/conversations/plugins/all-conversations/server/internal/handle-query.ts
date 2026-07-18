import { and, ilike, ne, or, type SQL } from "drizzle-orm";
import type { PgColumn, PgSelect } from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { resolveFieldFilterSql } from "@plugins/fields/plugins/server-capabilities/server";
import {
  augmentServerQuery,
  compileWhere,
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
import { conversationsView as conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { queryConversations } from "../../core";
import { COLUMN_MAP } from "./column-map";

// Escape LIKE wildcards so a user search term is matched literally (backslash is
// Postgres ILIKE's default escape char).
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Full-text-ish quick search: ILIKE over title / model / worktreePath. Blank
// query → undefined (no fragment).
function searchWhere(query: string): SQL | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const needle = `%${escapeLike(trimmed)}%`;
  return or(
    ilike(conversations.title, needle),
    ilike(conversations.model, needle),
    ilike(conversations.worktreePath, needle),
  );
}

// Field-type-agnostic: the SQL for each (type, operator) pair comes from the
// fields registry; an unknown pair resolves to `null` → that rule is dropped.
const resolver: OperatorSqlResolver = (typeId, operatorId) =>
  resolveFieldFilterSql(typeId, operatorId) ?? null;

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
  const { sort, filter, query, cursor, limit } = body;

  // Fold in the generic server-side augmentors (custom columns, …). Each binds
  // its aliased columns into `columnMap` (so sort/filter/seek reach them), a
  // `LEFT JOIN` thunk, and a projection (so `keyValuesOf` can mint the cursor).
  // The consumer names no contributor — this is the server twin of the web
  // global `FieldExtension` slot. `rowKeyCol` must be the column whose value ==
  // the web `rowKey(row)` (here `conversations.id`, matching `rowKey={c => c.id}`).
  const aug = await augmentServerQuery({
    dataViewId: body.dataViewId,
    rowKeyCol: conversations.id,
    sort,
    filter,
  });
  const columnMap = { ...COLUMN_MAP, ...aug.columnMap };

  // Always append PK `id asc` as a total-order tiebreaker so the keyset seek is
  // strict (gap-free / dup-free) even across the NULLS-LAST boundary.
  const keys = buildSortKeys(sort, columnMap, { col: conversations.id, fieldId: "id" });

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
    searchWhere(query),
    compileWhere(filter, columnMap, resolver),
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

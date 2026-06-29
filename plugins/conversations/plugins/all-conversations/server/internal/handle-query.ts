import { and, ilike, ne, or, type SQL } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { resolveFieldFilterSql } from "@plugins/fields/server";
import {
  buildSortKeys,
  compileWhere,
  keyValuesOf,
  orderByClauses,
  seekPredicate,
  type OperatorSqlResolver,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import {
  decodeCursor,
  encodeCursor,
  sortSignature,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/core";
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

export const handleQuery = implement(queryConversations, async ({ body }) => {
  const { sort, filter, query, cursor, limit } = body;

  // Always append PK `id asc` as a total-order tiebreaker so the keyset seek is
  // strict (gap-free / dup-free) even across the NULLS-LAST boundary.
  const keys = buildSortKeys(sort, COLUMN_MAP, { col: conversations.id, fieldId: "id" });

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
    compileWhere(filter, COLUMN_MAP, resolver),
    seek,
  );

  const rows = await db
    .select()
    .from(conversations)
    .where(where)
    .orderBy(...orderByClauses(keys))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor(
          keyValuesOf(last as unknown as Record<string, unknown>, keys),
          sortSignature(sort),
        )
      : null;

  return { items, nextCursor, hasMore };
});

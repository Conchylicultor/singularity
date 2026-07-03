import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { resolveFieldFilterSql } from "@plugins/fields/plugins/server-capabilities/server";
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
import {
  _mailThreads,
  mailViewFilterSql,
  resolveMailAccountId,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { MAIL_SYSTEM_VIEWS } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { queryInbox } from "../../core";
import { COLUMN_MAP } from "./column-map";

// Escape LIKE wildcards so a user search term is matched literally (backslash is
// Postgres ILIKE's default escape char).
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Full-text-ish quick search: ILIKE over subject / snippet. Blank query →
// undefined (no fragment).
function searchWhere(query: string): SQL | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const needle = `%${escapeLike(trimmed)}%`;
  return or(ilike(_mailThreads.subject, needle), ilike(_mailThreads.snippet, needle));
}

// Field-type-agnostic: the SQL for each (type, operator) pair comes from the
// fields registry; an unknown pair resolves to `null` → that rule is dropped.
const resolver: OperatorSqlResolver = (typeId, operatorId) =>
  resolveFieldFilterSql(typeId, operatorId) ?? null;

// The fixed INBOX ("not archived") scope — the `inbox` system view, i.e.
// `label_ids @> '["INBOX"]'`. Applied as a server-fixed AND predicate (the
// analog of all-conversations' `ne(kind,"system")`), NOT a removable filter
// chip, so a user can never pull spam/trash/sent into "Inbox".
const INBOX_FILTER = MAIL_SYSTEM_VIEWS[0]!.filter;

export const handleQuery = implement(queryInbox, async ({ body }) => {
  const { sort, filter, query, cursor, limit } = body;

  const accountId = await resolveMailAccountId();
  if (!accountId) return { items: [], nextCursor: null, hasMore: false };

  // Always append PK `id asc` as a total-order tiebreaker so the keyset seek is
  // strict (gap-free / dup-free) even across the NULLS-LAST boundary.
  const keys = buildSortKeys(sort, COLUMN_MAP, { col: _mailThreads.id, fieldId: "id" });

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
    eq(_mailThreads.accountId, accountId),
    mailViewFilterSql(INBOX_FILTER),
    searchWhere(query),
    compileWhere(filter, COLUMN_MAP, resolver),
    seek,
  );

  const rows = await db
    .select()
    .from(_mailThreads)
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

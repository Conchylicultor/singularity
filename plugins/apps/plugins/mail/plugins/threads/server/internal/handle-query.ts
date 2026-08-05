import type { SQL } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
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
import {
  _mailThreads,
  resolveMailAccountId,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { queryThreads } from "../../core";
import { COLUMN_MAP } from "./column-map";
import { buildThreadsWhere } from "./where";

export const handleQuery = implement(queryThreads, async ({ body }) => {
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

  // `filter` is the active tab's whole tree — the mailbox scope is one of its
  // ordinary rules, not a separate server-derived conjunct.
  const where = buildThreadsWhere({ accountId, filter, query, seek });

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

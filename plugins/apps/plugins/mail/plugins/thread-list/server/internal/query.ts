import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  parseMailView,
  MAIL_SYSTEM_VIEWS,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import {
  _mailThreads,
  mailViewFilterSql,
  resolveMailAccountId,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import type { MailThreadPage } from "../../core";
import { encodeThreadCursor, decodeThreadCursor } from "./cursor";

// Sane page-size ceiling so a hostile/oversized `limit` can't ask for the whole
// mailbox in one query (the client asks for 50).
const MAX_LIMIT = 200;

// The default view's filter — an unknown/legacy view string falls back to it
// rather than querying nothing. MAIL_SYSTEM_VIEWS[0] is "inbox".
const DEFAULT_FILTER = MAIL_SYSTEM_VIEWS[0]!.filter;

// The sort key materialized as epoch-millis (bigint), so the SQL keyset seek and
// the JS cursor (`Date.getTime()`) compare the exact same integer. `COALESCE`
// keeps it non-null, so the key is total and paging is stable.
const sortMsExpr = sql<number>`(extract(epoch from coalesce(${_mailThreads.lastMessageAt}, ${_mailThreads.createdAt})) * 1000)::bigint`;

export async function queryThreads(body: {
  view: string;
  cursor: string | null;
  limit: number;
}): Promise<MailThreadPage> {
  const accountId = await resolveMailAccountId();
  if (!accountId) return { items: [], nextCursor: null, hasMore: false };

  const filter = parseMailView(body.view) ?? DEFAULT_FILTER;
  const limit = Math.max(1, Math.min(Math.trunc(body.limit), MAX_LIMIT));

  const conds = [eq(_mailThreads.accountId, accountId), mailViewFilterSql(filter)];
  if (body.cursor) {
    const { sortMs, id } = decodeThreadCursor(body.cursor);
    conds.push(
      sql`(${sortMsExpr} < ${sortMs} OR (${sortMsExpr} = ${sortMs} AND ${_mailThreads.id} < ${id}))`,
    );
  }

  // Fetch one extra row to detect a further page without a second COUNT query.
  const rows = await db
    .select()
    .from(_mailThreads)
    .where(and(...conds))
    .orderBy(sql`${sortMsExpr} desc`, desc(_mailThreads.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  const last = items.at(-1);
  if (hasMore && last) {
    const sortDate = last.lastMessageAt ?? last.createdAt;
    nextCursor = encodeThreadCursor(new Date(sortDate).getTime(), last.id);
  }

  return { items, nextCursor, hasMore };
}

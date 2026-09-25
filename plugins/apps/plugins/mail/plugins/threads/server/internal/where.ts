import { and, eq, type SQL } from "drizzle-orm";
import type { Filter } from "@plugins/network/plugins/live/plugins/filter/core";
import { compileWhere } from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import { _mailThreads } from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { COLUMN_MAP } from "./column-map";

/**
 * The whole `WHERE` for one page of the threads DataView.
 *
 * There is **no mailbox scope here**. A mailbox is a view instance and its scope
 * is that view's ordinary, user-editable `filter` — so it arrives in `filter`
 * (search folded in by the DataView host) and compiles through the same
 * `compileWhere` path as every other clause. The one server-owned conjunct is
 * the account predicate, which is identity, not scope.
 *
 * Extracted from the handler so the composition is assertable in a `bun:test`
 * without a database.
 */
export function buildThreadsWhere(args: {
  accountId: string;
  /** The DECODED filter (`decodeFilterBody` against `MAIL_THREAD_FILTERABLE`). */
  filter: Filter | undefined;
  seek?: SQL;
}): SQL | undefined {
  return and(
    eq(_mailThreads.accountId, args.accountId),
    compileWhere(args.filter, COLUMN_MAP),
    args.seek,
  );
}

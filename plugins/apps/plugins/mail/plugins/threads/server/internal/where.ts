import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import { resolveFieldFilterSql } from "@plugins/fields/plugins/server-capabilities/server";
import {
  compileWhere,
  type OperatorSqlResolver,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import type { FilterGroup } from "@plugins/primitives/plugins/data-view/core";
import { _mailThreads } from "@plugins/apps/plugins/mail/plugins/mail-core/server";
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

/**
 * The whole `WHERE` for one page of the threads DataView.
 *
 * There is **no mailbox scope here**. A mailbox is a view instance and its scope
 * is that view's ordinary, user-editable `filter` — so it arrives in `filter` and
 * compiles through the same `compileWhere` path as every other rule. The one
 * server-owned conjunct is the account predicate, which is identity, not scope.
 *
 * Extracted from the handler so the composition is assertable in a `bun:test`
 * without a database.
 */
export function buildThreadsWhere(args: {
  accountId: string;
  filter: FilterGroup | null;
  query: string;
  seek?: SQL;
}): SQL | undefined {
  return and(
    eq(_mailThreads.accountId, args.accountId),
    searchWhere(args.query),
    compileWhere(args.filter, COLUMN_MAP, resolver),
    args.seek,
  );
}

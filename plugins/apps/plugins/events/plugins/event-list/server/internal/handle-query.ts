import {
  and,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { resolveFieldFilterSql } from "@plugins/fields/plugins/server-capabilities/server";
import {
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
import {
  eventsTable,
  _eventSources,
} from "@plugins/apps/plugins/events/plugins/events-core/server";
import { queryEvents } from "../../core";
import { COLUMN_MAP } from "./column-map";
import { shouldHideDisappeared, shouldHideInactiveSources } from "./scope";

// Escape LIKE wildcards so a user search term is matched literally (backslash is
// Postgres ILIKE's default escape char).
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Full-text-ish quick search over the fields a person actually types into a
// search box: what it is (title/description), where it is (venue/city), and how
// it is labelled (tags). `tags` is jsonb, so it is matched through a text cast —
// the ONLY tag predicate available until a `fields/tags` filter-sql capability
// exists (the `tags` field is otherwise display-only; see column-map.ts).
// Blank query → undefined (no fragment).
function searchWhere(query: string): SQL | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const needle = `%${escapeLike(trimmed)}%`;
  return or(
    ilike(eventsTable.title, needle),
    ilike(eventsTable.description, needle),
    ilike(eventsTable.venue, needle),
    ilike(eventsTable.city, needle),
    sql`${eventsTable.tags}::text ILIKE ${needle}`,
  );
}

// Field-type-agnostic: the SQL for each (type, operator) pair comes from the
// fields registry; an unknown pair resolves to `null` → that rule is dropped.
const resolver: OperatorSqlResolver = (typeId, operatorId) =>
  resolveFieldFilterSql(typeId, operatorId) ?? null;

export const handleQuery = implement(queryEvents, async ({ body }) => {
  const { sort, filter, query, cursor, limit } = body;

  // Always append PK `id asc` as a total-order tiebreaker so the keyset seek is
  // strict (gap-free / dup-free) even across the NULLS-LAST boundary.
  const keys = buildSortKeys(sort, COLUMN_MAP, {
    col: eventsTable.id,
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
    // Soft-deleted events are hidden unless the caller's filter says otherwise
    // — a default, not a fixed scope. See scope.ts for why.
    shouldHideDisappeared(filter)
      ? isNull(eventsTable.disappearedAt)
      : undefined,
    // Events of a DISABLED source are hidden the same way — also a default, also
    // overridden the moment the filter names `sourceId`. See scope.ts.
    //
    // Stated POSITIVELY ("the source is active") rather than as a NOT IN, so the
    // predicate reads as what it means and cannot be tripped by nullability;
    // `events.source_id` is NOT NULL and FK-cascaded, so every surviving event
    // has exactly one source row and the subquery is a total answer.
    //
    // A subquery, not a denormalized `enabled` copy on the event row:
    // `event_sources` is a small user-grown table (the sources UI itself windows
    // it at ~100 rows) indexed on `enabled`, so this costs nothing — whereas
    // copying a MUTABLE FK attribute onto an unbounded table would turn every
    // toggle of the switch into a backfill over every event of that source.
    shouldHideInactiveSources(filter)
      ? inArray(
          eventsTable.sourceId,
          db
            .select({ id: _eventSources.id })
            .from(_eventSources)
            .where(eq(_eventSources.enabled, true)),
        )
      : undefined,
    searchWhere(query),
    compileWhere(filter, COLUMN_MAP, resolver),
    seek,
  );

  const rows = await db
    .select()
    .from(eventsTable)
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

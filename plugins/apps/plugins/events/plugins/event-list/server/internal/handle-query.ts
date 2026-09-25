import { and, eq, getTableColumns, isNull, type SQL } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  compileWhere,
  decodeFilterBody,
  filterableOf,
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

export const handleQuery = implement(queryEvents, async ({ body }) => {
  const { sort, cursor, limit } = body;
  // Strict: a column the source does not declare is a 400, never dropped.
  const filter = decodeFilterBody(body.filter, filterableOf(COLUMN_MAP));

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
    // A predicate on the JOINED source row (below), not a denormalized `enabled`
    // copy on the event row: copying a MUTABLE FK attribute onto an unbounded
    // table would turn every toggle of the switch into a backfill over every
    // event of that source. `events.source_id` is NOT NULL and FK-cascaded, so
    // the inner join drops no event and this reads as exactly what it means.
    shouldHideInactiveSources(filter)
      ? eq(_eventSources.enabled, true)
      : undefined,
    compileWhere(filter, COLUMN_MAP),
    seek,
  );

  // Each row carries its source's ref, so the client resolves "where did this
  // come from?" from the row it holds — see `SourcedEventSchema`.
  const rows = await db
    .select({
      ...getTableColumns(eventsTable),
      source: { type: _eventSources.type, config: _eventSources.config },
    })
    .from(eventsTable)
    .innerJoin(_eventSources, eq(_eventSources.id, eventsTable.sourceId))
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

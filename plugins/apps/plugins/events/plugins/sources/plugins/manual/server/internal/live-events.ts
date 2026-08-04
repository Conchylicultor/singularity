import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { eventsTable } from "@plugins/apps/plugins/events/plugins/events-core/server";

/**
 * The live rows of one source — `disappeared_at IS NULL` deliberately.
 *
 * Vouching for an already-disappeared row would RESURRECT it: `upsertEvents`
 * clears `disappearedAt` on the conflict path, because a source listing an event
 * again means it is back. Excluding them costs nothing on the other side —
 * `markEventsDisappeared` only ever stamps rows that are not already stamped, so
 * a row left out of the seen-set because it is already gone stays exactly as it
 * was.
 *
 * A read, never a write: the `events/no-raw-events-write` lint rule reserves
 * insert/update/delete on this handle to the repo funnel, and the manual type has
 * no business bypassing it.
 */
export async function loadLiveEvents(
  sourceId: string,
): Promise<(typeof eventsTable.$inferSelect)[]> {
  return db
    .select()
    .from(eventsTable)
    .where(
      and(eq(eventsTable.sourceId, sourceId), isNull(eventsTable.disappearedAt)),
    )
    .orderBy(asc(eventsTable.startsAt));
}

import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _events } from "./tables";

// THE ONLY sanctioned write path to `events`.
//
// Why a funnel rather than "remember to set updatedAt": the `events.revision`
// live tick is `count(*) + max(updated_at)`, so a write that forgets the stamp
// lands in the DB and never reaches the open DataView — a silent staleness bug,
// invisible in tests, that any future writer re-introduces for free. Here the
// stamp is applied by the only code that can write, so forgetting it is not
// expressible. The barrel therefore exports the events table as a READ handle
// (`eventsTable`) plus these two writers, and the `events/no-raw-events-write`
// lint rule fails any `db.insert/update/delete(eventsTable)` outside this file.
//
// The two functions below are the only two write SHAPES the engine performs
// ("upsert diff → stamp disappearedAt"). Everything else about refreshing —
// externalId derivation, the run ledger, error classification, scheduling — is
// the `refresh` plugin's, and is deliberately not here.

/**
 * One event as the engine hands it over: every column except the row-lifecycle
 * and sighting stamps, which this module owns. Derived from the table's insert
 * type, so adding a field to `eventFields` updates this by construction.
 */
export type EventWriteInput = Omit<
  typeof _events.$inferInsert,
  "firstSeenAt" | "lastSeenAt" | "disappearedAt" | "createdAt" | "updatedAt"
>;

export interface UpsertEventsResult {
  created: number;
  updated: number;
}

/**
 * Upsert a batch against the unique `(source_id, external_id)` identity: a row
 * the source has not produced before is inserted, one it has is refreshed in
 * place (and un-disappeared, since the source is vouching for it again).
 *
 * Re-extraction is therefore idempotent — running it twice over an unchanged
 * page produces `created: 0` and touches only the sighting stamps.
 *
 * One statement per row inside a single transaction: an extraction is tens of
 * events, and the per-row form keeps the update set derived from the input keys
 * (so a new field cannot be silently dropped on the conflict path). If a source
 * type ever produces thousands of rows, batch this into a multi-row
 * `excluded.*` upsert — do not move the write out of this module.
 */
export async function upsertEvents(
  inputs: readonly EventWriteInput[],
): Promise<UpsertEventsResult> {
  if (inputs.length === 0) return { created: 0, updated: 0 };

  return db.transaction(async (tx) => {
    let created = 0;
    let updated = 0;

    for (const input of inputs) {
      const now = new Date();
      // Identity columns are never part of the conflict-path update: they ARE
      // the conflict target. Everything else the caller supplied is refreshed.
      const { id: _id, sourceId: _sourceId, externalId: _externalId, ...content } =
        input;

      const [row] = await tx
        .insert(_events)
        .values({
          ...input,
          firstSeenAt: now,
          lastSeenAt: now,
          disappearedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [_events.sourceId, _events.externalId],
          set: {
            ...content,
            lastSeenAt: now,
            // The source listed it again, so it is no longer gone.
            disappearedAt: null,
            updatedAt: now,
          },
        })
        // `xmax = 0` on the returned tuple is true exactly for a fresh INSERT.
        .returning({ inserted: sql<boolean>`(xmax = 0)` });

      if (!row) {
        throw new Error(
          `[events] upsert returned no row for (${input.sourceId}, ${input.externalId})`,
        );
      }
      if (row.inserted) created += 1;
      else updated += 1;
    }

    return { created, updated };
  });
}

/**
 * Soft-disappearance: stamp every not-already-disappeared event of this source
 * that a SUCCESSFUL FULL extraction did not list. Returns how many were
 * stamped.
 *
 * Only ever call this after a run that genuinely enumerated the whole source —
 * a partial or failed extraction must not reach here, or a flaky scrape marks
 * the user's whole list gone. Rows are never deleted, so a subsequent
 * successful run un-disappears them via `upsertEvents`.
 */
export async function markEventsDisappeared(
  sourceId: string,
  seenExternalIds: readonly string[],
): Promise<number> {
  const now = new Date();
  const stillPresent = isNull(_events.disappearedAt);
  const rows = await db
    .update(_events)
    .set({ disappearedAt: now, updatedAt: now })
    .where(
      seenExternalIds.length === 0
        ? // The source successfully listed nothing: everything it had is gone.
          // (`notInArray` with an empty list is not valid SQL, hence the branch.)
          and(eq(_events.sourceId, sourceId), stillPresent)
        : and(
            eq(_events.sourceId, sourceId),
            stillPresent,
            notInArray(_events.externalId, [...seenExternalIds]),
          ),
    )
    .returning({ id: _events.id });
  return rows.length;
}

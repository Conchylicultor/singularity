import type { EventDateProjection } from "@plugins/apps/plugins/events/plugins/event-date/core";
import type { ExtractedEvent } from "@plugins/apps/plugins/events/plugins/events-core/core";
import type {
  eventsTable,
  EventWriteInput,
} from "@plugins/apps/plugins/events/plugins/events-core/server";

// The echo: how a manual source answers "what is your full current set?".
//
// The engine's contract is "`extract` returns the full current set, and every
// identity absent from it gets `disappearedAt` stamped". For a fetching type the
// current set comes off the wire. For a manual type there IS no wire — the user
// is the extractor and the rows they typed ARE the set — so the honest answer to
// that question is the source's own live rows, handed back unchanged.
//
// Returning `[]` would be a lie with teeth: `markEventsDisappeared` reads an
// empty seen-set as "the source successfully listed nothing" and buries every
// event of that source in one statement. `source-type.ts` carries the rest of
// the argument — this file is only the mapping.
//
// Pure on purpose (type-only imports, no `db`, no clock): the half worth testing
// is the one that decides what a refresh vouches for, and it is testable without
// a database. The query lives next door in `live-events.ts`.

type EventRow = typeof eventsTable.$inferSelect;

/**
 * Every `events` column the ENGINE does not own — i.e. everything the echo has to
 * carry, derived from the contract's own `EventWriteInput` rather than a
 * hand-kept list. `id` and `sourceId` are excluded because the engine re-derives
 * them from the identity.
 */
type EchoedColumn = Exclude<keyof EventWriteInput, "id" | "sourceId">;

/**
 * The columns the ENGINE re-derives from `date` via `eventDateProjection`. They
 * are carried by `date` being carried, so the echo must NOT restate them — but
 * only while `date` itself travels: if `ExtractedEvent` ever loses the field, the
 * excuse collapses to `never` and all five reappear as uncarried, which is the
 * truth at that point.
 *
 * Read off `EventDateProjection` rather than hand-listed, so the plugin that owns
 * the derivation is the one that names its outputs.
 */
type DerivedFromDate = "date" extends keyof ExtractedEvent
  ? keyof EventDateProjection
  : never;

/**
 * Echoed columns that reach the write plan by NEITHER route — no
 * `ExtractedEvent` field of their own, and not derived from one. Necessarily
 * lossy.
 */
type UncarriedColumn = Exclude<
  EchoedColumn,
  keyof ExtractedEvent | DerivedFromDate
>;

/**
 * Compile-time proof that the echo is **lossless**, and the whole reason the
 * types above exist.
 *
 * `planEventWrites` writes every optional it does not receive as an explicit
 * `null` (so a venue dropping a price clears it), which means a column the echo
 * cannot carry is not merely skipped — it is **erased** on the next refresh, on
 * data the user typed by hand. Adding such a column to `eventFields` therefore
 * fails tsc here, naming the column, instead of silently arming that erasure.
 *
 * The fix when it fires is a decision, not a cast: either `ExtractedEvent` learns
 * the field (it is extracted fact), or the engine derives the column from one it
 * already has (as it does for the five date projections), or the manual type must
 * stop echoing (it is a user annotation the engine has no business rewriting —
 * see the contract gap noted in this plugin's `CLAUDE.md`).
 */
export type EchoIsLossless = [UncarriedColumn] extends [never]
  ? true
  : ["events columns the echo cannot carry:", UncarriedColumn];

export const echoIsLossless: EchoIsLossless = true;

/**
 * One stored row as the extraction shape, value-for-value.
 *
 * `externalId` is supplied rather than left for the engine to derive: the
 * derivation is `sha256(sourceId + normalizedTitle + eventDateIdentityKey(date))`,
 * so a row whose title or date the user edited after it was first written would
 * derive a DIFFERENT identity — inserting a duplicate and burying the original
 * as disappeared. Echoing the stored identity makes the round trip exact.
 *
 * `date` is echoed and the columns derived FROM it (`startsAt` / `endsAt` /
 * `allDay` / `recurring` / `recurrenceLabel`) are not, because the engine
 * re-derives every one of them from `date` through `eventDateProjection`. Echoing
 * them too would be echoing a value the engine is about to recompute — a second
 * statement of the same fact, and the shape a drift starts in.
 *
 * `null` becomes `undefined` because `ExtractedEventSchema`'s optionals are
 * `.optional()`, not `.nullable()`; `planEventWrites` maps both back to `null`
 * with `??`, so the column value is unchanged either way.
 *
 * `date` comes back off `jsonb` with its instants as ISO STRINGS — jsonb has no
 * `Date` — even though the column is typed `EventDate`. That is safe here and
 * only because the engine re-validates: `z.coerce.date()` turns them back into
 * `Date`s in `planEventWrites`. Do not read `row.date.startsAt` as a `Date`
 * without going through the schema.
 */
export function toExtractedEvent(row: EventRow): ExtractedEvent {
  return {
    externalId: row.externalId,
    title: row.title,
    description: row.description ?? undefined,
    date: row.date,
    venue: row.venue ?? undefined,
    city: row.city ?? undefined,
    url: row.url ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    price: row.price ?? undefined,
    category: row.category,
    tags: row.tags,
  };
}

/** The pure half of `extract`: rows in, the identical set out. */
export function echoRows(rows: readonly EventRow[]): ExtractedEvent[] {
  return rows.map(toExtractedEvent);
}

import {
  eventDateProjection,
  resolveAnchor,
  type EventDate,
  type EventOccurrence,
} from "@plugins/apps/plugins/events/plugins/event-date/core";
import {
  ExtractedEventSchema,
  type ExtractedEvent,
} from "@plugins/apps/plugins/events/plugins/events-core/core";
import type { EventWriteInput } from "@plugins/apps/plugins/events/plugins/events-core/server";
import { deriveEventRowId, resolveExternalId } from "./external-id";

// Extraction → the exact rows to write, as a PURE function: no DB, no
// randomness, and no clock of its own — `now` is a parameter, so the plan stays
// a total function of its inputs and the interesting half of the engine is
// unit-testable. `runSource` then does nothing but hand the plan to the repo
// funnel.

export interface EventWritePlan {
  /** The rows to upsert, one per DISTINCT identity, in first-seen order. */
  inputs: EventWriteInput[];
  /**
   * The identities this extraction vouched for — exactly the set
   * `markEventsDisappeared` must NOT stamp. Same order as `inputs`.
   */
  seenExternalIds: string[];
}

/**
 * The anchor the row is written with, resolved against the clock by the format
 * itself (`resolveAnchor`).
 *
 * A model that anchors "every Thursday" on a Tuesday, or on a date already past,
 * is CORRECTED rather than trusted: the first occurrence at or after `now` is
 * re-derived from the rule. A one-off, by contrast, is never re-anchored and
 * never expires — last week's concert still happened — which is exactly why the
 * decision lives in `event-date` and this file does not branch on `kind`.
 *
 * `{ found: false }` is a legitimate answer, not a failure: a SERIES whose
 * `until` has passed or whose `count` is spent is over, so there is nothing left
 * to write and it drops out of the plan. It is a discriminated result precisely
 * so this case cannot be mistaken for "no date" (`no-absorbed-failure`).
 */
type AnchoredDate =
  | { kind: "anchored"; date: EventDate; occurrence: EventOccurrence }
  | { kind: "exhausted" };

function anchor(date: EventDate, now: Date): AnchoredDate {
  const resolved = resolveAnchor(date, now);
  if (!resolved.found) return { kind: "exhausted" };
  return { kind: "anchored", date, occurrence: resolved.occurrence };
}

/**
 * Map one validated extraction onto the engine-owned write shape.
 *
 * `date` is written verbatim — it is the authority. `startsAt` / `endsAt` /
 * `allDay` / `recurring` / `recurrenceLabel` are its DENORMALIZED PROJECTIONS,
 * so the columns cannot state something the format does not: the three
 * occurrence columns come from the ONE normalized occurrence, the two
 * series-level ones from `eventDateProjection`.
 *
 * Every optional field is written as an explicit `null`, never left `undefined`:
 * the upsert's conflict path sets exactly the keys present in this object, so an
 * omitted key would leave the PREVIOUS value in place — a venue that drops the
 * price from its page would keep showing last month's price forever. Explicit
 * null is what makes a re-extraction a full replacement of the extracted facts.
 */
function toWriteInput(
  sourceId: string,
  externalId: string,
  event: ExtractedEvent,
  anchored: Extract<AnchoredDate, { kind: "anchored" }>,
): EventWriteInput {
  const projection = eventDateProjection(anchored.date);
  return {
    id: deriveEventRowId(sourceId, externalId),
    sourceId,
    externalId,
    title: event.title,
    description: event.description ?? null,
    date: anchored.date,
    startsAt: anchored.occurrence.startsAt,
    endsAt: anchored.occurrence.endsAt,
    allDay: anchored.occurrence.allDay,
    venue: event.venue ?? null,
    city: event.city ?? null,
    url: event.url ?? null,
    imageUrl: event.imageUrl ?? null,
    price: event.price ?? null,
    category: event.category,
    tags: event.tags ?? [],
    recurring: projection.recurring,
    recurrenceLabel: projection.recurrenceLabel,
  };
}

/**
 * Turn what a source type extracted into the rows to write and the identities to
 * spare from disappearance — exactly ONE row per extracted event, including a
 * recurring one: the row IS the series, and its rule travels in `date`.
 *
 * Re-validates against `ExtractedEventSchema` first. A source type is typed to
 * return `ExtractedEvent[]`, but it is an arbitrary plugin (and, for the URL
 * extractor, an LLM response one layer up) — so the engine checks its own input
 * rather than trusting it. A violation THROWS (a `ZodError`, classified terminal)
 * instead of writing a half-valid row or silently dropping it.
 *
 * Collisions inside one extraction are collapsed here, last-wins: two entries
 * resolving to the same identity are the same event listed twice, and letting
 * both through would make the upsert conflict with itself inside its own
 * transaction and inflate the `found` count with a phantom row.
 */
export function planEventWrites(
  sourceId: string,
  extracted: readonly ExtractedEvent[],
  { now }: { now: Date },
): EventWritePlan {
  const validated = ExtractedEventSchema.array().parse(extracted);

  // Insertion-ordered, so `inputs` and `seenExternalIds` stay aligned and the
  // plan is stable across runs (a stable plan is a diffable plan).
  const byExternalId = new Map<string, EventWriteInput>();
  for (const event of validated) {
    const anchored = anchor(event.date, now);
    // An exhausted series is over, not broken: it is dropped from the plan, and
    // therefore also from the seen-set — so the row it used to occupy gets
    // `disappearedAt` stamped, which is exactly what "this series has ended"
    // should look like on a soft-deleted list.
    if (anchored.kind === "exhausted") continue;
    const externalId = resolveExternalId(sourceId, event);
    byExternalId.set(
      externalId,
      toWriteInput(sourceId, externalId, event, anchored),
    );
  }

  return {
    inputs: [...byExternalId.values()],
    seenExternalIds: [...byExternalId.keys()],
  };
}

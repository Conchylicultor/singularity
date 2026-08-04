import {
  ExtractedEventSchema,
  type ExtractedEvent,
} from "@plugins/apps/plugins/events/plugins/events-core/core";
import type { EventWriteInput } from "@plugins/apps/plugins/events/plugins/events-core/server";
import { deriveEventRowId, resolveExternalId } from "./external-id";

// Extraction → the exact rows to write, as a PURE function: no DB, no clock, no
// randomness. `runSource` then does nothing but hand the plan to the repo
// funnel, which is what makes the interesting half of the engine unit-testable.

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
 * Map one validated extraction onto the engine-owned write shape.
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
): EventWriteInput {
  return {
    id: deriveEventRowId(sourceId, externalId),
    sourceId,
    externalId,
    title: event.title,
    description: event.description ?? null,
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? null,
    allDay: event.allDay ?? false,
    venue: event.venue ?? null,
    city: event.city ?? null,
    url: event.url ?? null,
    imageUrl: event.imageUrl ?? null,
    price: event.price ?? null,
    category: event.category,
    tags: event.tags ?? [],
    recurring: event.recurring ?? false,
    recurrenceLabel: event.recurrenceLabel ?? null,
    seriesKey: event.seriesKey ?? null,
  };
}

/**
 * Turn what a source type extracted into the rows to write and the identities to
 * spare from disappearance.
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
): EventWritePlan {
  const validated = ExtractedEventSchema.array().parse(extracted);

  // Insertion-ordered, so `inputs` and `seenExternalIds` stay aligned and the
  // plan is stable across runs (a stable plan is a diffable plan).
  const byExternalId = new Map<string, EventWriteInput>();
  for (const event of validated) {
    const externalId = resolveExternalId(sourceId, event);
    byExternalId.set(externalId, toWriteInput(sourceId, externalId, event));
  }

  return {
    inputs: [...byExternalId.values()],
    seenExternalIds: [...byExternalId.keys()],
  };
}

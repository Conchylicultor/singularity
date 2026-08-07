import { z } from "zod";
import { EventDateSchema } from "@plugins/apps/plugins/events/plugins/event-date/core";
import { EVENT_CATEGORIES } from "./vocab";

/**
 * What a source type's `extract` reports for ONE event — the wire between an
 * extractor and the refresh engine, and the schema the URL extractor's Sonnet
 * response is parsed against.
 *
 * Deliberately NOT the `events` row shape: everything the engine owns is absent.
 * `id`, `sourceId`, `firstSeenAt`/`lastSeenAt`/`disappearedAt` are engine-written,
 * and `externalId` is OPTIONAL — a source type supplies one when its upstream has
 * a stable id, and the engine derives `sha256(sourceId + normalizedTitle +
 * eventDateIdentityKey(date))` when it doesn't. Deriving it in the engine is what
 * keeps re-extraction idempotent by construction.
 *
 * `date` is the WHOLE temporal statement, one arm per shape (`once` /
 * `recurring`) — an extractor states "every Thursday" once rather than emitting
 * one near-identical row per occurrence. The denormalized `startsAt` / `endsAt` /
 * `allDay` / `recurring` / `recurrenceLabel` columns are projections of it,
 * derived by the engine through `eventDateProjection`, never supplied here: two
 * writable statements of the same fact are two statements that drift.
 *
 * An extractor that fails **throws** (see `defineEventSourceType`); returning
 * `events: []` means the page genuinely lists no events.
 */
export const ExtractedEventSchema = z.object({
  externalId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  /** When it happens — a single instant or a whole series, stated once. */
  date: EventDateSchema,
  venue: z.string().optional(),
  city: z.string().optional(),
  url: z.string().optional(),
  imageUrl: z.string().optional(),
  /** Free text ("Free", "12–18 €") — venues do not publish a normalizable number. */
  price: z.string().optional(),
  category: z.enum(EVENT_CATEGORIES),
  tags: z.array(z.string()).optional(),
});

export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;

/**
 * What one `extract` call reports in full: the events, plus what the extractor
 * could not express.
 *
 * `flags` is global to the parse SESSION, never per event, and free text rather
 * than a `{ code, message }`: a code would have to be a closed vocabulary of
 * *things the date format cannot express*, which is unknowable in advance — that
 * is the entire reason the channel exists. One entry per limitation. A structured
 * element type can be widened in later without a wire break.
 *
 * Flags are a report, NOT a failure and NOT an escape hatch: an event whose date
 * cannot be determined is still omitted, and an extractor that cannot do its job
 * still throws. A flagged extraction is a successful one.
 */
export const ExtractionResultSchema = z.object({
  events: ExtractedEventSchema.array(),
  flags: z.array(z.string()).default([]),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

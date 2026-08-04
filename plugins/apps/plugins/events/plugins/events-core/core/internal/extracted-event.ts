import { z } from "zod";
import { EVENT_CATEGORIES } from "./vocab";

/**
 * What a source type's `extract` returns — the wire between an extractor and the
 * refresh engine, and the schema the URL extractor's Sonnet response is parsed
 * against.
 *
 * Deliberately NOT the `events` row shape: everything the engine owns is absent.
 * `id`, `sourceId`, `firstSeenAt`/`lastSeenAt`/`disappearedAt` are engine-written,
 * and `externalId` is OPTIONAL — a source type supplies one when its upstream has
 * a stable id, and the engine derives `sha256(sourceId + normalizedTitle +
 * startsAt::date)` when it doesn't. Deriving it in the engine is what keeps
 * re-extraction idempotent by construction.
 *
 * An extractor that fails **throws** (see `defineEventSourceType`); returning
 * `[]` means the page genuinely lists no events.
 */
export const ExtractedEventSchema = z.object({
  externalId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  allDay: z.boolean().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  url: z.string().optional(),
  imageUrl: z.string().optional(),
  /** Free text ("Free", "12–18 €") — venues do not publish a normalizable number. */
  price: z.string().optional(),
  category: z.enum(EVENT_CATEGORIES),
  tags: z.array(z.string()).optional(),
  /**
   * Recurrence is materialized, not RRULE: a recurring event is emitted as ONE
   * row per concrete occurrence within the extraction horizon, all sharing a
   * `seriesKey`, with `recurring: true` and a human `recurrenceLabel`.
   */
  recurring: z.boolean().optional(),
  recurrenceLabel: z.string().optional(),
  seriesKey: z.string().optional(),
});

export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;

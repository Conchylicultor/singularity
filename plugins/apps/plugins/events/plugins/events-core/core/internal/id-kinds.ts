import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * The two prefixed id kinds the Events app keys its tables by, declared once
 * (`plugins/ids`):
 *
 * - `evs` — an event source (`event_sources.id`), minted by the source repo.
 *   Rows minted as `evs-<ms>-<≤6>` stay recognised.
 * - `evt` — an event (`events.id`). A `hash` kind: the id is DERIVED from the
 *   event's identity (`sha256(sourceId, externalId)`, first 32 hex chars), so a
 *   refresh's write plan is a pure function of what it extracted
 *   (`refresh/external-id.ts`, `eventIdKind.mint(digest)`).
 */
export const eventSourceIdKind = defineIdKind({
  prefix: "evs",
  label: "Event source",
});

export const eventIdKind = defineIdKind({
  prefix: "evt",
  label: "Event",
  shape: "hash",
});

export type EventSourceId = IdOf<typeof eventSourceIdKind>;
export type EventId = IdOf<typeof eventIdKind>;

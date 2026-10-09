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

/**
 * `evrun` — one refresh run of an event source (`event_source_runs.id`),
 * minted by `runSource` BEFORE its ledger row is written, so in-flight work (a
 * model call's correlation id) can name the run it belongs to.
 * `legacyBareUuid`: the bare-uuid rows (and the model calls correlated to them)
 * were prefixed by a data migration; `key` upgrades an old `run/<uuid>` URL.
 */
export const eventRunIdKind = defineIdKind({
  prefix: "evrun",
  label: "Event source run",
  legacyBareUuid: true,
});

export type EventRunId = IdOf<typeof eventRunIdKind>;
export type EventSourceId = IdOf<typeof eventSourceIdKind>;
export type EventId = IdOf<typeof eventIdKind>;

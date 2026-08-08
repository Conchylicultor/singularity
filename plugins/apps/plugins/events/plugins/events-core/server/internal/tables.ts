import { index, uniqueIndex } from "drizzle-orm/pg-core";
import {
  defineEntity,
  defaultNow,
} from "@plugins/infra/plugins/entities/server";
import {
  eventSourceFields,
  eventFields,
  eventSourceRunFields,
  eventSourceRunEventFields,
} from "../../core";

// Physical tables for the Events app, derived from the web-safe field records in
// `core/internal/fields.ts` via `defineEntity` — so `entity.table.$inferSelect`
// is identical by construction to the public `z.infer<...Schema>`. FK / cascade /
// index / default DDL lives in the `meta` below; the field records stay name- and
// storage-agnostic.
//
// This file is a load-order leaf: it must NOT import another plugin's
// schema/tables file so cross-plugin schemas can depend on it without forming a
// cycle, and it must stay synchronously requireable (no top-level await) because
// drizzle-kit's sync loader evaluates it. Every table is re-exported with a
// leading `_` so drizzle-kit's `schema*.ts` glob discovers it while the barrel
// exposes only the handle.

const eventSources = defineEntity("event_sources", eventSourceFields, {
  primaryKey: "id",
  columns: {
    config: { default: {} },
    refresh: { default: "manual" },
    enabled: { default: true },
    status: { default: "idle" },
    lastFlags: { default: [] },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
  indexes: (t) => [
    // The cadence tick's whole predicate: enabled sources whose watermark is due.
    index("event_sources_enabled_next_run_idx").on(t.enabled, t.nextRunAt),
  ],
});

const events = defineEntity("events", eventFields, {
  primaryKey: "id",
  columns: {
    sourceId: {
      references: { column: () => eventSources.table.id, onDelete: "cascade" },
    },
    // `date` deliberately has NO default: there is no honest constant for "when
    // does this happen", so a write that omits it must fail loudly rather than
    // land an epoch-dated row. Its wire default in `core/internal/fields.ts` is
    // unreachable for exactly this reason.
    allDay: { default: false },
    tags: { default: [] },
    recurring: { default: false },
    firstSeenAt: { default: defaultNow() },
    lastSeenAt: { default: defaultNow() },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
  indexes: (t) => [
    // Dedup identity. The engine upserts ON CONFLICT against this, which is why
    // `externalId` is NOT NULL — a nullable column would make the conflict target
    // unusable and let re-extraction duplicate every event.
    uniqueIndex("events_source_external_id_idx").on(t.sourceId, t.externalId),
    // Every default view is ordered/filtered by when the event happens.
    index("events_starts_at_idx").on(t.startsAt),
    // No standalone `(source_id)` index: the unique index above is prefixed by
    // it, so per-source lookups and the FK cascade already use that one. A second
    // index would only cost write amplification on every upsert.
  ],
});

const eventSourceRuns = defineEntity(
  "event_source_runs",
  eventSourceRunFields,
  {
    primaryKey: "id",
    columns: {
      sourceId: {
        references: {
          column: () => eventSources.table.id,
          onDelete: "cascade",
        },
      },
      startedAt: { default: defaultNow() },
      outcome: { default: "unchanged" },
      eventsFound: { default: 0 },
      eventsCreated: { default: 0 },
      eventsUpdated: { default: 0 },
      eventsDisappeared: { default: 0 },
      flags: { default: [] },
    },
    indexes: (t) => [
      // The source detail pane's Runs section: this source, newest first.
      index("event_source_runs_source_started_idx").on(t.sourceId, t.startedAt),
    ],
  },
);

const eventSourceRunEvents = defineEntity(
  "event_source_run_events",
  eventSourceRunEventFields,
  {
    // The pair IS the row's identity — a run touches an event once — so there is
    // no synthetic id to keep unique separately. The PK's own index is prefixed
    // by `run_id`, which is the only way this table is ever read.
    primaryKey: ["runId", "eventId"],
    columns: {
      runId: {
        references: {
          column: () => eventSourceRuns.table.id,
          onDelete: "cascade",
        },
      },
      eventId: {
        references: { column: () => events.table.id, onDelete: "cascade" },
      },
    },
    indexes: (t) => [
      // NOT redundant with the PK: the PK index is prefixed by `run_id`, so it
      // cannot serve the `event_id` cascade. Without this, purging one
      // disappeared event (the 90-day sweep, thousands at a time) seq-scans this
      // whole table per row.
      index("event_source_run_events_event_idx").on(t.eventId),
    ],
  },
);

// drizzle-kit schema-glob discovery.
export const _eventSources = eventSources.table;
export const _events = events.table;
export const _eventSourceRuns = eventSourceRuns.table;
export const _eventSourceRunEvents = eventSourceRunEvents.table;

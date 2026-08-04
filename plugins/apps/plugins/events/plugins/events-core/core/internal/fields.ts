import { z } from "zod";
import { nullable, type FieldsRecord } from "@plugins/fields/core";
import {
  textField,
  enumTextField,
} from "@plugins/fields/plugins/text/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";
import {
  EVENT_CATEGORIES,
  REFRESH_CADENCES,
  RUN_OUTCOMES,
  SOURCE_STATUSES,
} from "./vocab";

// Web-safe field records for the Events app's three persisted tables — one
// `FieldsRecord` per table, the single source of truth for both the Drizzle
// pgTable (derived in `server/internal/tables.ts` via `defineEntity`) and the
// public wire schema (`fieldsToZodObject` in `./schema.ts`). A column/schema
// drift is therefore unrepresentable: `entity.table.$inferSelect ≡ z.infer<Schema>`.
//
// Keys are the JS property names (camelCase) IN COLUMN ORDER; the DB column name
// is `snakeCase(key)`. FK / cascade / index / default DDL is expressed in the
// `defineEntity` meta, NOT here — this file is name- and storage-agnostic.

/**
 * One configured source instance ("the Fitzroy page"), NOT a source *type*.
 *
 * Sources are rows rather than a config singleton because the user adds N
 * instances of the same type and `events` FK back to them. Runtime/derived state
 * (`status`, `lastFingerprint`, the run watermarks, the classified error) lives
 * here and never in `config` — the `mail_accounts` + `mail_sync_state` split.
 * `config` holds only the per-type user input, validated against the source
 * type's own `configFields`.
 */
export const eventSourceFields = {
  id: textField(),
  /** The `EventSourceType.id` this row dispatches to (`url`, `manual`, …). */
  type: textField(),
  /** User label; defaulted from the URL host at create time. */
  name: textField(),
  /** Per-type user input, validated against the type's `configFields` on write. */
  config: jsonField<Record<string, unknown>>({
    schema: z.record(z.string(), z.unknown()),
    default: {},
  }),
  refresh: enumTextField(REFRESH_CADENCES),
  enabled: boolField(),
  status: enumTextField(SOURCE_STATUSES),
  /** The probe cache key. The engine calls `extract` ONLY when this moves. */
  lastFingerprint: nullable(textField()),
  lastRunAt: nullable(dateField()),
  /** Scheduler watermark — the cadence tick reads this, not a cron per source. */
  nextRunAt: nullable(dateField()),
  /** Classified TERMINAL failure only; a transient failure stays on the run row. */
  lastError: nullable(textField()),
  lastErrorCode: nullable(textField()),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

/**
 * The domain table.
 *
 * Two timestamp pairs on purpose, because they answer different questions:
 * `createdAt`/`updatedAt` are ROW lifecycle (any write, including a future user
 * annotation — the revision tick reads `updatedAt`), while
 * `firstSeenAt`/`lastSeenAt`/`disappearedAt` are EXTRACTION sighting (when the
 * source last vouched for this event). Disappearance is soft: an event absent
 * from a successful full extraction gets `disappearedAt` stamped, never deleted,
 * so a flaky scrape cannot destroy rows the user may have annotated.
 */
export const eventFields = {
  id: textField(),
  sourceId: textField(),
  /**
   * Dedup identity, unique per `(sourceId, externalId)`. A source type MAY
   * supply it; when it can't (an LLM extraction can't), the ENGINE derives
   * `sha256(sourceId + normalizedTitle + startsAt::date)`. Deriving it in the
   * engine rather than per-type is what keeps re-extraction idempotent by
   * construction — never make this nullable.
   */
  externalId: textField(),
  title: textField(),
  description: nullable(textField()),
  startsAt: dateField(),
  endsAt: nullable(dateField()),
  allDay: boolField(),
  venue: nullable(textField()),
  city: nullable(textField()),
  url: nullable(textField()),
  imageUrl: nullable(textField()),
  /** Free text ("Free", "12–18 €") — venues do not publish a normalizable number. */
  price: nullable(textField()),
  category: enumTextField(EVENT_CATEGORIES),
  // `jsonField<string[]>`, NOT `stringListField`: the `string-list` field type has
  // no `Fields.Storage` contribution, so `defineEntity` cannot map it to a column
  // (it is a config-only type). This is the `mail_threads.labelIds` idiom.
  tags: jsonField<string[]>({ schema: z.array(z.string()), default: [] }),
  recurring: boolField(),
  /** Human label for a recurring series ("every Thursday"). */
  recurrenceLabel: nullable(textField()),
  /** Shared by every materialized occurrence of one series. */
  seriesKey: nullable(textField()),
  firstSeenAt: dateField(),
  lastSeenAt: dateField(),
  disappearedAt: nullable(dateField()),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

/**
 * The run ledger — what makes "why did nothing happen" answerable. One row per
 * `runSource` invocation, including the cheap `unchanged` ones.
 */
export const eventSourceRunFields = {
  id: textField(),
  sourceId: textField(),
  startedAt: dateField(),
  finishedAt: nullable(dateField()),
  outcome: enumTextField(RUN_OUTCOMES),
  eventsFound: intField(),
  eventsCreated: intField(),
  eventsUpdated: intField(),
  eventsDisappeared: intField(),
  /** The fingerprint this run observed (null when the probe cannot fingerprint). */
  fingerprint: nullable(textField()),
  durationMs: nullable(intField()),
  error: nullable(textField()),
} satisfies FieldsRecord;

// The Events app's closed vocabularies. Plain `core/` data, NOT slots: per the
// root CLAUDE.md collection rule, a list you can enumerate today and that BOTH
// runtimes need is data — a slot would buy an open set nobody can add to
// meaningfully and cost a web↔server codegen bridge.
//
// Each list feeds `enumTextField(...)` in `./fields.ts`, so the DB column stays
// a plain `text` while the TS value type is the exact union. The category list
// is additionally handed verbatim to the extraction prompt, which is why it must
// be one array both sides read.

/** Event categories. Promote to a registry only when a source type must add one. */
export const EVENT_CATEGORIES = [
  "music",
  "party",
  "club",
  "tech",
  "art",
  "food",
  "sport",
  "community",
  "other",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** How often a source is re-probed. `manual` is never picked up by the scheduler. */
export const REFRESH_CADENCES = ["manual", "hourly", "daily", "weekly"] as const;
export type RefreshCadence = (typeof REFRESH_CADENCES)[number];

/** Runtime state of a source row, written by the refresh engine. */
export const SOURCE_STATUSES = ["idle", "running", "error"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/**
 * How a single refresh run ended.
 * - `unchanged` — the probe fingerprint matched; extraction was NOT run (this is
 *   the cache assertion: no model call was paid for).
 * - `extracted` — the fingerprint moved, extraction ran, the diff was upserted.
 * - `failed` — probe or extract threw; the classified error lands on the source row.
 */
export const RUN_OUTCOMES = ["unchanged", "extracted", "failed"] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

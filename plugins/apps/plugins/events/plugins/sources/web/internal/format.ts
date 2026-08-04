import type { BadgeVariant } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  REFRESH_CADENCES,
  RUN_OUTCOMES,
  SOURCE_STATUSES,
  type EventSourceRun,
  type RefreshCadence,
  type RunOutcome,
  type SourceStatus,
} from "@plugins/apps/plugins/events/plugins/events-core/core";

// Display metadata for the Events source vocabularies, plus the run-row sentence.
// Pure data + string building (no React), so it is unit-testable and shared by
// every surface that paints a source — one label per value, in one place.
//
// Each map is keyed by the closed vocabulary's own union type, so adding a
// cadence / status / outcome to `events-core` is a tsc error here rather than a
// silently unlabelled chip.

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const CADENCE_LABEL: Record<RefreshCadence, string> = {
  manual: "Manual",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
};

export const CADENCE_OPTIONS = REFRESH_CADENCES.map((c) => ({
  value: c,
  label: CADENCE_LABEL[c],
}));

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  idle: "Idle",
  running: "Running",
  error: "Error",
};

export const SOURCE_STATUS_OPTIONS = SOURCE_STATUSES.map((s) => ({
  value: s,
  label: SOURCE_STATUS_LABEL[s],
}));

export const SOURCE_STATUS_VARIANT: Record<SourceStatus, BadgeVariant> = {
  idle: "muted",
  running: "info",
  error: "destructive",
};

export const RUN_OUTCOME_LABEL: Record<RunOutcome, string> = {
  // Named for what it MEANS, not for the enum value: "Unchanged" alone reads as
  // "nothing happened / something is broken", which is exactly the question the
  // run ledger exists to answer. The saved model call is the headline.
  unchanged: "Unchanged",
  extracted: "Extracted",
  failed: "Failed",
};

export const RUN_OUTCOME_OPTIONS = RUN_OUTCOMES.map((o) => ({
  value: o,
  label: RUN_OUTCOME_LABEL[o],
}));

export const RUN_OUTCOME_VARIANT: Record<RunOutcome, BadgeVariant> = {
  unchanged: "muted",
  extracted: "success",
  failed: "destructive",
};

/** `null` when the run never recorded a duration (it is still in flight). */
export function formatDuration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

/**
 * The one-line human account of a run — what the ledger is FOR.
 *
 * `unchanged` gets a full sentence rather than a bare word: it is the outcome a
 * user reads as "nothing happened, is it broken?", and the honest answer (the
 * page did not move, so the expensive phase was skipped on purpose) is the whole
 * payoff of the probe/extract split. Hiding or shortening it is what makes the
 * cache look like a bug.
 */
export function describeRun(run: EventSourceRun): string {
  if (run.outcome === "unchanged") {
    return "Page unchanged — extraction skipped, no model call.";
  }
  if (run.outcome === "failed") {
    return run.error ?? "Failed with no recorded error.";
  }
  const parts = [`${run.eventsFound} found`];
  if (run.eventsCreated > 0) parts.push(`${run.eventsCreated} new`);
  if (run.eventsUpdated > 0) parts.push(`${run.eventsUpdated} updated`);
  if (run.eventsDisappeared > 0) parts.push(`${run.eventsDisappeared} gone`);
  if (parts.length === 1) parts.push("no changes");
  return parts.join(" · ");
}

/** Sentence-case a raw enum value that has no label map (defensive display). */
export function formatUnknownValue(value: string): string {
  return cap(value);
}

import { z } from "zod";

/**
 * The shared outcome vocabulary every run kind maps its own status into.
 *
 * Deliberately small and closed. It is the axis a person filters and groups by
 * across kinds — "what failed today" has to mean the same thing for a build and
 * for a backup — so it holds only distinctions that are true of *every* kind of
 * run:
 *
 * - `running`   — still in flight.
 * - `succeeded` — finished, did what it set out to do.
 * - `partial`   — finished, did some of it. Backup is why this exists: a run
 *                 that reached three of four targets is neither a success nor a
 *                 failure, and flattening it into either loses the only fact
 *                 that matters.
 * - `failed`    — finished, did not do it. The one outcome a person must act on.
 * - `canceled`  — ended without a verdict, by something other than the work
 *                 itself (superseded, interrupted, killed). Not a defect.
 *
 * An arm's *finer* status (`superseded` vs `killed`, `ok` vs `partial`) is not
 * lost: it stays an arm field, so precision lives beside the shared axis rather
 * than instead of it.
 *
 * Declaration order is the order the filter dropdown and group-by sections
 * offer — most urgent first is deliberately NOT the order; lifecycle order is,
 * because that is how a list of runs reads.
 */
export const RUN_OUTCOMES = [
  "running",
  "succeeded",
  "partial",
  "failed",
  "canceled",
] as const;

export type RunOutcome = (typeof RUN_OUTCOMES)[number];

/**
 * Wire schema for an outcome. An arm produces this value from a SQL `CASE`, so
 * a branch it forgot arrives as `null` or as its own native word — and this
 * throws on it rather than letting an unlabelled row into the list.
 */
export const RunOutcomeSchema = z.enum(RUN_OUTCOMES);

/** Is this run still in flight? The one predicate several surfaces need. */
export function isRunInFlight(outcome: RunOutcome): boolean {
  return outcome === "running";
}

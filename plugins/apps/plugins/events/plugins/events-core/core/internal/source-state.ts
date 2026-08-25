import { extractionStatus } from "./extraction-status";
import type { EventSource } from "./schema";
import { EXTRACTION_STATUSES } from "./vocab";

/**
 * The ONE thing a sources list says about a source in one word — the union of
 * the two facts that outrank the extraction verdict and the verdict itself.
 *
 * Derived, never stored, and deliberately not in `./vocab.ts`: the vocabularies
 * there are the closed sets a DB column is constrained to, and no column holds
 * this. It is built ON the extraction statuses rather than re-listing them, so
 * a new extraction status widens this set for free.
 *
 * Order is the precedence order `sourceState` states below, which is also the
 * order a group-by / filter picker offers.
 */
export const SOURCE_STATES = [
  "disabled",
  "running",
  ...EXTRACTION_STATUSES,
] as const;
export type SourceState = (typeof SOURCE_STATES)[number];

/**
 * A source's state, with a three-way precedence: `disabled` > `running` > the
 * last extraction's verdict.
 *
 * `disabled` wins outright because the extraction status is then a fact about
 * the PAST that no longer describes the row: a source switched off last month
 * still remembers that its final run failed, and painting `Failed` on it demands
 * attention for something the user already dealt with by switching it off. It is
 * also the state the row's own control is set to, so what the row says and what
 * the switch shows agree.
 *
 * Below that, while a run is in flight the live `running` state wins — it is
 * transient and the most interesting thing about the row at that moment. Every
 * other moment the row shows what the last extraction produced.
 *
 * The other two `status` values are deliberately never reachable here. `idle`
 * says nothing anyone wants: every healthy source is idle almost all of the
 * time, so it would be a constant. And `error` is strictly subsumed — a terminal
 * failure always writes a failed run, so the extraction status says `failed`
 * too, while a TRANSIENT failure leaves `status: idle` and only the extraction
 * status tells the truth. So this answer is never less informative than `status`
 * and often more.
 *
 * Takes a `Pick`, exactly as its sibling `extractionStatus` does and for the
 * same reason: any caller holding the four facts can ask without materializing
 * a source row.
 */
export function sourceState(
  source: Pick<
    EventSource,
    "enabled" | "status" | "lastOutcome" | "lastEventCount"
  >,
): SourceState {
  if (!source.enabled) return "disabled";
  if (source.status === "running") return "running";
  return extractionStatus(source);
}

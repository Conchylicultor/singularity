import type { OpRecord } from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import { readOpRecords } from "@plugins/debug/plugins/profiling/plugins/op-log/server";

/**
 * The completed pushes these stats aggregate over.
 *
 * Sourced from the shared op-log reader (`readOpRecords`), which merges the new
 * `op-log.jsonl` with the two frozen legacy files. This plugin used to carry its
 * OWN copy of the push record + reader, and that copy had already drifted from
 * the debug pane's — it never modelled `opSlug` and never knew about the
 * synthetic in-flight outcomes. There is one reader now.
 *
 * Two exclusions, both deliberate, both required for an aggregate to mean
 * anything:
 *
 * - **In-flight ops.** `readOpRecords` returns live ops with the synthetic
 *   `"waiting"` / `"running"` outcomes and durations clocked against the
 *   reader's `now`. Counting them would make a chart depend on when it was
 *   loaded: an unfinished push has no final outcome (so throughput cannot say
 *   success or failed), and its wait is still growing (so wait-time's avg/max
 *   would drift downward on every refresh) — and it has no steps at all yet.
 *   The reader the old copy replaced dropped these by discarding non-terminal
 *   phases; dropping them here is the same decision, made explicitly.
 * - **Interrupted ops.** Hard-killed and closed by the orphan reconciler. They
 *   carry no real duration and no steps — a synthetic zero, not a measurement.
 */
export function readCompletedPushes(): OpRecord[] {
  return readOpRecords().filter(
    (r) =>
      r.kind === "push" &&
      r.outcome !== "waiting" &&
      r.outcome !== "running" &&
      !r.interrupted,
  );
}

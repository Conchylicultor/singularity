import type { HolderObservation } from "@plugins/framework/plugins/cli/plugins/bootstrap/cli";
import type { BuildRunProgress } from "@plugins/framework/plugins/cli/plugins/op-runtime/cli";
import type { OpenWait } from "@plugins/debug/plugins/profiling/plugins/op-log/core";

/**
 * Classify a build-lock holder from what the two host-global logs say about it:
 * its build-progress run (found by pid) and the wait its op record has open
 * (found by the run's build id).
 *
 * - no live run → `unknown`: nothing proves what the holder is doing (a
 *   release's hermetic build writes no run), so the lock keeps its plain limit;
 * - an open declared wait → `waiting`: queued, not stuck;
 * - otherwise → `working`, judged by its last step boundary.
 *
 * Pure, so the policy's input is testable without the real logs.
 */
export function buildHolderObservation(
  run: BuildRunProgress | undefined,
  openWait: OpenWait | null,
  files: { progress: string; opLog: string },
): HolderObservation {
  if (!run || run.done !== null) return { kind: "unknown" };
  if (openWait !== null) {
    return {
      kind: "waiting",
      wait: openWait.kind,
      since: Date.parse(openWait.startedAt),
      evidence: files.opLog,
    };
  }
  return {
    kind: "working",
    step: run.outstanding.at(-1)?.label ?? null,
    lastAdvanceAt: Date.parse(run.lastAdvanceAt),
    evidence: files.progress,
  };
}

import type { RunTerminal } from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";

/**
 * The two things a supervised-run kind does the instant its run ends, and the
 * order they happen in.
 */
export interface RunFinishArms {
  /**
   * Close the ledger row if it is still open — a bare terminal write
   * (`WHERE finished_at IS NULL`) and nothing else.
   */
  closeRow(runId: string, terminal: RunTerminal): Promise<void>;
  /** Announce that the run ended, waking whichever workflow is waiting on it. */
  announce(runId: string): Promise<void>;
}

/**
 * Close, then announce.
 *
 * **The close is a backstop and must not depend on anything downstream
 * succeeding.** The announcement is what wakes the job handler, and the handler
 * is what does the run's terminal WORK — but a workflow can die (dead-lettered,
 * or killed between spawning its child and recording that it did), and if
 * closing the row were the workflow's job alone, that row would stay open
 * forever. The kind's partial unique in-flight index would then refuse every
 * future run of that kind, permanently, with no symptom at the call site.
 *
 * So the split is by WHAT each arm does, not by which one runs:
 *
 * - here — the terminal write, and nothing else. Idempotent, first-writer-wins,
 *   and reached from the reconciler that runs in every backend.
 * - the job's `onEnded` — the side effects (notification, convergence reconcile)
 *   and any data beyond the terminal. Exactly-once, because only that arm has
 *   them, and a lost workflow costs them rather than costing the ledger.
 *
 * Closing FIRST is what makes that true: by the time anyone can react to the
 * announcement, the row is already closed, and an announcement that throws
 * (the emit is a DB write) still leaves a closed row behind it.
 */
export async function finishSupervisedRun(
  arms: RunFinishArms,
  runId: string,
  terminal: RunTerminal,
): Promise<void> {
  await arms.closeRow(runId, terminal);
  await arms.announce(runId);
}

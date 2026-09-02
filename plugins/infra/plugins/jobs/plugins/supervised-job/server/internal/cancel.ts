import {
  killSupervisedRun,
  type KillOutcome,
} from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import type { z } from "zod";
import type { SupervisedJob } from "./define-supervised-job";

/**
 * Cancel one run of a supervised job: signal its process group and let the
 * workflow record what happened.
 *
 * **Cancelling a supervised job is ONE action, not two, and the missing second
 * half is deliberate.** The general advice for a durable workflow blocked on
 * `ctx.waitFor` is to kill the work AND call `abortDurableRun(workflowRunId)`,
 * because otherwise the workflow stays suspended until its timeout. That advice
 * inverts here, and following it would lose data:
 *
 * - The kill goes to the process GROUP, so the shim's TERM trap fires and writes
 *   an exit marker — `143 TERM`, an observed cancellation rather than a guess.
 *   That marker is what the suspended handler wakes on, and waking is what runs
 *   `onEnded`. **The wait is not a leak to plug; it is how the cancellation gets
 *   recorded.**
 * - `abortDurableRun` cancels the pending wait, so a later resume no-ops. Call
 *   it on a live supervised job and the handler never comes back: `onEnded`
 *   never runs, the ledger row is never stamped, and the kind's partial unique
 *   in-flight index then refuses every future run of that kind.
 *
 * So the workflow always closes itself, on every path a cancellation can take. A
 * SIGTERM leaves a marker and the wake is immediate; a hard SIGKILL leaves none,
 * and the handler's next bounded wake sees a dead pid and records the hard-kill
 * outcome. The one place `abortDurableRun` belongs is AFTER the outcome has been
 * recorded, which the wrapper's own handler does for itself.
 *
 * The pid comes from the kind's ledger rather than any in-memory map, so this
 * works on a run started by a previous backend.
 */
export function cancelSupervisedJob<N extends string, S extends z.ZodType>(
  job: SupervisedJob<N, S>,
  runId: string,
): Promise<KillOutcome> {
  return killSupervisedRun(job.kind, runId);
}

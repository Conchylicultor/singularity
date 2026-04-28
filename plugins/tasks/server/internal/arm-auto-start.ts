import {
  hasBlockingDep,
  setTaskAutoStart,
  taskStatusChanged,
} from "@plugins/tasks-core/server";
import { triggerByName } from "@plugins/infra/plugins/events/server";
import { UNSAFE_getRegisteredJob } from "@plugins/infra/plugins/jobs/server";

const MAYBE_LAUNCH_JOB = "tasks.maybe-launch";

// Mark a task as queued and either install per-dep unblock triggers (if it
// has any blocking deps) or enqueue tasks.maybe-launch immediately. Shared
// by the REST POST /api/tasks handler and the MCP add_task tool so both
// queue paths produce the same trigger graph.
export async function armTaskAutoStart(args: {
  taskId: string;
  model: "opus" | "sonnet";
  dependencies: readonly string[];
}): Promise<void> {
  const { taskId, model, dependencies } = args;
  await setTaskAutoStart(taskId, { model });

  if (await hasBlockingDep(taskId)) {
    // Per-dep oneShot triggers: fire on done (the typical unblock path) and
    // on dropped (also non-blocking per the tasks_v derivation). Held deps
    // don't fire — the task stays blocked until the user un-holds and the
    // dep eventually reaches done. Multiple deps stack: each one fires
    // maybe-launch, the job re-checks hasBlockingDep, and only the last
    // unblocking transition actually launches.
    for (const depId of dependencies) {
      await triggerByName({
        on: taskStatusChanged.where({ taskId: depId, status: "done" }),
        jobName: MAYBE_LAUNCH_JOB,
        with: { taskId },
        oneShot: true,
      });
      await triggerByName({
        on: taskStatusChanged.where({ taskId: depId, status: "dropped" }),
        jobName: MAYBE_LAUNCH_JOB,
        with: { taskId },
        oneShot: true,
      });
    }
  } else {
    // No blocking deps — either no deps at all, or every dep was already
    // done/dropped at queue time. Enqueue immediately rather than arm
    // triggers that would never fire.
    const job = UNSAFE_getRegisteredJob(MAYBE_LAUNCH_JOB);
    if (job) await job.enqueue({ taskId });
  }
}

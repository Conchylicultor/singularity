import {
  hasBlockingDep,
  setTaskAutoStart,
  taskStatusChanged,
} from "@plugins/tasks-core/server";
import { trigger } from "@plugins/infra/plugins/events/server";
import { maybeLaunchTaskJob } from "@plugins/conversations/server";

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
      await trigger({
        on: taskStatusChanged.where({ taskId: depId, status: "done" }),
        do: maybeLaunchTaskJob,
        with: { taskId },
        oneShot: true,
      });
      await trigger({
        on: taskStatusChanged.where({ taskId: depId, status: "dropped" }),
        do: maybeLaunchTaskJob,
        with: { taskId },
        oneShot: true,
      });
    }
  } else {
    // No blocking deps — either no deps at all, or every dep was already
    // done/dropped at queue time. Enqueue immediately rather than arm
    // triggers that would never fire.
    await maybeLaunchTaskJob.enqueue({ taskId });
  }
}

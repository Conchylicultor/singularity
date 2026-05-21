import { hasBlockingDep } from "@plugins/tasks-core/server";
import { setTaskAutoStart } from "@plugins/tasks/plugins/auto-start/server";
import { maybeLaunchTaskJob } from "@plugins/conversations/server";

// Mark a task as queued for auto-launch. If no deps block it, enqueue
// immediately. If blocked, the static taskStatusChanged →
// maybeLaunchDependentsJob trigger (registered by the conversations plugin)
// will fire when deps complete and fan out to maybeLaunchTaskJob.
export async function armTaskAutoStart(args: {
  taskId: string;
  model: "opus" | "sonnet";
  dependencies: readonly string[];
  cause: string;
}): Promise<void> {
  const { taskId, model, cause } = args;
  await setTaskAutoStart(taskId, { model });

  if (!(await hasBlockingDep(taskId))) {
    await maybeLaunchTaskJob.enqueue({ taskId, cause });
  }
}

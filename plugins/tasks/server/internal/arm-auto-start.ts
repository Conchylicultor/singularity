import { db } from "@plugins/database/server";
import { hasBlockingDep } from "@plugins/tasks/plugins/tasks-core/server";
import { setTaskAutoStart } from "@plugins/tasks/plugins/auto-start/server";
import { maybeLaunchTaskJob } from "@plugins/conversations/server";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";

// Mark a task as queued for auto-launch. If no deps block it, enqueue
// immediately. If blocked, the static taskStatusChanged →
// maybeLaunchDependentsJob trigger (registered by the conversations plugin)
// will fire when deps complete and fan out to maybeLaunchTaskJob.
export async function armTaskAutoStart(args: {
  taskId: string;
  model: ConversationModel;
  dependencies: readonly string[];
  cause: string;
}): Promise<void> {
  const { taskId, model, cause } = args;
  await setTaskAutoStart(taskId, { model });

  if (!(await hasBlockingDep(taskId, db))) {
    await maybeLaunchTaskJob.enqueue({ taskId, cause });
  }
}

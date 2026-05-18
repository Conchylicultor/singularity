import { getTask } from "@plugins/tasks-core/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { setTaskAutoStart } from "../../core/endpoints";
import { armTaskAutoStart } from "./arm-auto-start";

export const handleSetAutoStart = implement(setTaskAutoStart, async ({ params, body }) => {
  const task = await getTask(params.id);
  if (!task) throw new HttpError(404, "Not found");

  // Route through armTaskAutoStart (not setTaskAutoStart) so per-dep oneShot
  // triggers get installed — or the job gets enqueued immediately when no
  // deps block. Otherwise the autoStartAt marker would just sit on the row
  // with nothing wired to fire maybeLaunchTaskJob.
  await armTaskAutoStart({
    taskId: params.id,
    model: body.model,
    dependencies: task.dependencies,
  });
  // return undefined → implement() sends 204
});

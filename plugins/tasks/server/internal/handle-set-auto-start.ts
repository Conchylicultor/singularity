import { getTask } from "@plugins/tasks/plugins/tasks-core/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { assertChoiceLaunchable } from "@plugins/conversations/plugins/model-provider/core";
import { getModelCatalog } from "@plugins/conversations/plugins/model-provider/plugins/catalog/server";
import { setTaskAutoStart } from "../../core/endpoints";
import { armTaskAutoStart } from "./arm-auto-start";

export const handleSetAutoStart = implement(
  setTaskAutoStart,
  async ({ params, body }) => {
    const task = await getTask(params.id);
    if (!task) throw new HttpError(404, "Not found");
    // Arming a version this machine cannot run would only park a launch that
    // is refused later: refuse it now, listing what can run.
    assertChoiceLaunchable(body.model, getModelCatalog());

    // Route through armTaskAutoStart (not setTaskAutoStart) so per-dep oneShot
    // triggers get installed — or the job gets enqueued immediately when no
    // deps block. Otherwise the autoStartAt marker would just sit on the row
    // with nothing wired to fire maybeLaunchTaskJob.
    await armTaskAutoStart({
      taskId: params.id,
      model: body.model,
      cause: "user-launch",
    });
    // return undefined → implement() sends 204
  },
);

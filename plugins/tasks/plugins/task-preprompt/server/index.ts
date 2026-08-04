import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { TaskLaunchApply } from "@plugins/tasks/plugins/launch-options/server";
import { taskPrepromptsResource } from "./internal/resource";
import { handlePutTaskPreprompt, handleDeleteTaskPreprompt } from "./internal/routes";
import { setTaskPreprompt } from "./internal/mutations";
import { putTaskPreprompt, deleteTaskPreprompt } from "../shared/endpoints";
import { prepromptLaunchOption } from "../core";

export { tasksPreprompt } from "./internal/tables";
export { getTaskPreprompt, setTaskPreprompt, inheritTaskPreprompt } from "./internal/mutations";
export { taskPrepromptsResource } from "./internal/resource";

export default {
  description:
    "Owns the tasks_ext_preprompt side-table: the per-task selected preprompt id, prepended to the agent's first user turn at launch as a <special_instructions> block.",
  contributions: [
    Resource.Declare(taskPrepromptsResource),
    TaskLaunchApply({
      def: prepromptLaunchOption,
      apply: ({ taskId }, prepromptId) => setTaskPreprompt(taskId, prepromptId),
    }),
  ],
  httpRoutes: {
    [putTaskPreprompt.route]: handlePutTaskPreprompt,
    [deleteTaskPreprompt.route]: handleDeleteTaskPreprompt,
  },
} satisfies ServerPluginDefinition;

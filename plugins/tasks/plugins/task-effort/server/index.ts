import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { TaskLaunchApply } from "@plugins/tasks/plugins/launch-options/server";
import { taskEffortsResource } from "./internal/resource";
import { handlePutTaskEffort, handleDeleteTaskEffort } from "./internal/routes";
import { setTaskEffort } from "./internal/mutations";
import { putTaskEffort, deleteTaskEffort } from "../shared/endpoints";
import { effortLaunchOption } from "../core";

export { tasksEffort } from "./internal/tables";
export { getTaskEffort, setTaskEffort, inheritTaskEffort } from "./internal/mutations";
export { taskEffortsResource } from "./internal/resource";

export default {
  description:
    "Owns the tasks_ext_effort side-table: the per-task thinking mode (effort level), applied to Claude Code at launch via --effort / --settings ultracode.",
  contributions: [
    Resource.Declare(taskEffortsResource),
    TaskLaunchApply({
      def: effortLaunchOption,
      apply: ({ taskId }, level) => setTaskEffort(taskId, level),
    }),
  ],
  httpRoutes: {
    [putTaskEffort.route]: handlePutTaskEffort,
    [deleteTaskEffort.route]: handleDeleteTaskEffort,
  },
} satisfies ServerPluginDefinition;

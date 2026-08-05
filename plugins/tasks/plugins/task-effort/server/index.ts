import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { TaskLaunchServer } from "@plugins/tasks/plugins/launch-options/server";
import { taskEffortsResource } from "./internal/resource";
import { handlePutTaskEffort, handleDeleteTaskEffort } from "./internal/routes";
import { setTaskEffort, inheritTaskEffort } from "./internal/mutations";
import { putTaskEffort, deleteTaskEffort } from "../shared/endpoints";
import { effortLaunchOption } from "../core";

export { tasksEffort } from "./internal/tables";
// `inheritTaskEffort` is deliberately NOT exported: inheritance is reached only
// through the launch-option registry's `inherit` verb, so no consumer can wire
// this option by name and drift from the others again.
export { getTaskEffort, setTaskEffort } from "./internal/mutations";
export { taskEffortsResource } from "./internal/resource";

export default {
  description:
    "Owns the tasks_ext_effort side-table: the per-task thinking mode (effort level), applied to Claude Code at launch via --effort / --settings ultracode.",
  contributions: [
    Resource.Declare(taskEffortsResource),
    TaskLaunchServer({
      def: effortLaunchOption,
      apply: ({ taskId }, level) => setTaskEffort(taskId, level),
      inherit: inheritTaskEffort,
    }),
  ],
  httpRoutes: {
    [putTaskEffort.route]: handlePutTaskEffort,
    [deleteTaskEffort.route]: handleDeleteTaskEffort,
  },
} satisfies ServerPluginDefinition;

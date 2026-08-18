import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { taskStatusChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { tasksAutoStartResource } from "./internal/resource";
import {
  autoStartDroppedSweepWarmup,
  cancelAutoStartOnDropJob,
} from "./internal/cancel-on-drop";

export { tasksAutoStartResource } from "./internal/resource";
export {
  setTaskAutoStart,
  claimAutoStart,
  getTaskAutoStart,
  listArmedTaskIds,
} from "./internal/mutations";

export default {
  description:
    "Owns the tasks_ext_auto_start side-table via the entity-extensions primitive. CAS mutations for setTaskAutoStart/claimAutoStart.",
  contributions: [
    Resource.Declare(tasksAutoStartResource),
    Trigger({
      on: taskStatusChanged,
      do: cancelAutoStartOnDropJob,
      with: {},
      oneShot: false,
    }),
  ],
  register: [cancelAutoStartOnDropJob, autoStartDroppedSweepWarmup],
} satisfies ServerPluginDefinition;

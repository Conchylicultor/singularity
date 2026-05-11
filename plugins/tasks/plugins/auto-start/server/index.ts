import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { tasksAutoStartResource } from "./internal/resource";

export { tasksAutoStartResource } from "./internal/resource";
export { setTaskAutoStart, claimAutoStart, getTaskAutoStart } from "./internal/mutations";

export default {
  id: "tasks-auto-start",
  name: "Tasks: Auto-Start",
  description:
    "Owns the tasks_ext_auto_start side-table via the entity-extensions primitive. CAS mutations for setTaskAutoStart/claimAutoStart.",
  contributions: [Resource.Declare(tasksAutoStartResource)],
} satisfies ServerPluginDefinition;

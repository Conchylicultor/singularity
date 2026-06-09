import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { tasksAutoStartResource } from "./internal/resource";

export { tasksAutoStartResource } from "./internal/resource";
export { setTaskAutoStart, claimAutoStart, getTaskAutoStart } from "./internal/mutations";

export default {
  description:
    "Owns the tasks_ext_auto_start side-table via the entity-extensions primitive. CAS mutations for setTaskAutoStart/claimAutoStart.",
  contributions: [Resource.Declare(tasksAutoStartResource)],
} satisfies ServerPluginDefinition;

import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { listContainerTaskIds } from "@plugins/tasks/plugins/container-tasks/core";
import { handleListContainerTaskIds } from "./internal/handle-list";

export { ContainerTask } from "./internal/contribution";
export { isContainerTask, assertNotContainerTask } from "./internal/guard";

export default {
  description:
    "Registry of system container/meta task ids that must not own attempts: server-contribution registry + guard, plus a cached endpoint so the web can gate Launch affordances on container rows.",
  httpRoutes: {
    [listContainerTaskIds.route]: handleListContainerTaskIds,
  },
} satisfies ServerPluginDefinition;

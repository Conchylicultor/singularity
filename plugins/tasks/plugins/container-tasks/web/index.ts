import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useContainerTaskIds, useIsContainerTask } from "./internal/use-container-task-ids";

export default {
  description:
    "Registry of system container/meta task ids that must not own attempts: a cached hook so the web can gate Launch affordances on container rows.",
  contributions: [],
} satisfies PluginDefinition;

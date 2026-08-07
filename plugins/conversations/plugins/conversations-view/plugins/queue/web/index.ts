import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { applyReorder } from "./components/apply-reorder";
export type { ReorderVars } from "./components/apply-reorder";
export { classifyQueue } from "./classify-queue";
export type { ClassifiedQueue, RankedConversation, TaskGroup } from "./classify-queue";

export default {
  description:
    "Queue classification + reorder logic (classifyQueue / applyReorder) consumed by the DataView Queue tab. Ranks seeded once on creation (newest first); a user-set pin lifts a waiting task group into its own top section.",
  contributions: [],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { applyReorder } from "./components/apply-reorder";
export type { ReorderVars } from "./components/apply-reorder";
export { classifyQueue } from "./classify-queue";
export type { ClassifiedQueue, RankedConversation, TaskGroup } from "./classify-queue";

export default {
  description:
    "Queue classification + reorder logic (classifyQueue / applyReorder) consumed by the DataView Queue tab. Ranks seeded once on creation (newest first); pinned top conversation is the user's current focus.",
  contributions: [],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  patchTask,
  setAutoStart,
  useTask,
  useActiveDependentCount,
} from "./client";
export type { TaskPatch, AutoStartModel, DependentCountResult } from "./client";

export default {
  description: "Nested tasks with attempts linking to conversations.",
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  patchTask,
  setAutoStart,
  useTask,
} from "./client";
export type { TaskPatch, AutoStartModel } from "./client";

export default {
  name: "Tasks",
  description: "Nested tasks with attempts linking to conversations.",
} satisfies PluginDefinition;

import type { PluginDefinition } from "@core";

export {
  patchTask,
  setAutoStart,
  deleteTask,
  useTask,
} from "./client";
export type { TaskPatch, AutoStartModel } from "./client";

export default {
  id: "tasks",
  name: "Tasks",
  description: "Nested tasks with attempts linking to conversations.",
} satisfies PluginDefinition;

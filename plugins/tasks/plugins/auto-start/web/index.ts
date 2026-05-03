import type { PluginDefinition } from "@core";

export { taskAutoStartResource, TaskAutoStartRowSchema } from "../shared/resources";
export type { TaskAutoStartRow } from "../shared/resources";
export { useTaskAutoStart } from "./hooks";

export default {
  id: "tasks-auto-start",
  name: "Tasks: Auto-Start",
  description:
    "Owns the tasks_ext_auto_start side-table via the entity-extensions primitive.",
  contributions: [],
} satisfies PluginDefinition;

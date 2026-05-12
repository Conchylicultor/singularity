import type { PluginDefinition } from "@core";

export { taskAutoStartResource, TaskAutoStartRowSchema } from "../internal/resources";
export type { TaskAutoStartRow } from "../internal/resources";
export { useTaskAutoStart } from "./hooks";

export default {
  id: "tasks-auto-start",
  name: "Tasks: Auto-Start",
  description:
    "Owns the tasks_ext_auto_start side-table via the entity-extensions primitive.",
  contributions: [],
} satisfies PluginDefinition;

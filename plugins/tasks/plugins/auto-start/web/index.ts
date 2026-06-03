import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Tasks } from "@plugins/tasks/plugins/task-list/web";
import { QueuedChipAction } from "./components/queued-chip-action";

export { taskAutoStartResource, TaskAutoStartRowSchema } from "../shared/resources";
export type { TaskAutoStartRow } from "../shared/resources";
export { useTaskAutoStart } from "./hooks";

export default {
  name: "Tasks: Auto-Start",
  description:
    "Owns the tasks_ext_auto_start side-table via the entity-extensions primitive.",
  contributions: [
    Tasks.TaskActions({ id: "queued-chip", component: QueuedChipAction }),
  ],
} satisfies PluginDefinition;

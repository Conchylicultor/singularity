import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Tasks } from "@plugins/tasks/plugins/task-list/web";
import { TaskPrompt } from "@plugins/tasks/plugins/task-description/web";
import { QueuedChipAction } from "./components/queued-chip-action";
import { TaskAutoStartControl } from "./components/auto-start-control";

export { taskAutoStartResource, TaskAutoStartRowSchema } from "../shared/resources";
export type { TaskAutoStartRow } from "../shared/resources";
export { useTaskAutoStart } from "./hooks";

export default {
  description:
    "Owns the tasks_ext_auto_start side-table via the entity-extensions primitive, and contributes the auto-start model picker as a launch option of the task's Prompt card.",
  contributions: [
    Tasks.TaskActions({ id: "queued-chip", component: QueuedChipAction }),
    TaskPrompt.LaunchOption({
      id: "auto-start",
      label: "Auto-start",
      component: TaskAutoStartControl,
    }),
  ],
} satisfies PluginDefinition;

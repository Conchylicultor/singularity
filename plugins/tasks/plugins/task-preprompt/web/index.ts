import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskPrepromptSection } from "./components/task-preprompt-section";

export { useTaskPreprompt } from "./hooks";

export default {
  name: "Tasks: Preprompt",
  description:
    "Per-task preprompt picker in the task detail pane; the selection is appended to the agent's system prompt on launch.",
  contributions: [
    TaskDetailSlots.Section({ id: "preprompt", label: "Preprompt", component: TaskPrepromptSection }),
  ],
} satisfies PluginDefinition;

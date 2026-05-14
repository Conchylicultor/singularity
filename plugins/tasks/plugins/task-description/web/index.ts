import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskDescription } from "./components/task-description";

export default {
  id: "task-description",
  name: "Task: Description",
  description:
    "Description editor section in the task detail pane. Inline file-link parsing routes clicks to the active file-peek context.",
  contributions: [
    TaskDetailSlots.Section({ id: "description", label: "Description", component: TaskDescription }),
  ],
} satisfies PluginDefinition;

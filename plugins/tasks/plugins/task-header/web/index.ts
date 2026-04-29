import type { PluginDefinition } from "@core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskHeader } from "./components/task-header";

export default {
  id: "task-header",
  name: "Task: Header",
  description:
    "Top section of the task detail pane: editable title, status chip, hold/drop buttons, author, auto-start, and Launch buttons.",
  contributions: [
    TaskDetailSlots.Section({ id: "header", order: 10, component: TaskHeader }),
  ],
} satisfies PluginDefinition;

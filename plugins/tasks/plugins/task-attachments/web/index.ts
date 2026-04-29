import type { PluginDefinition } from "@core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskAttachments } from "./components/task-attachments";

export default {
  id: "task-attachments",
  name: "Task: Attachments",
  description:
    "Renders the task's attachments (images, files) in the detail pane.",
  contributions: [
    TaskDetailSlots.Section({ id: "attachments", order: 40, component: TaskAttachments }),
  ],
} satisfies PluginDefinition;

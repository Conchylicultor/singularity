import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskAttachments } from "./components/task-attachments";

export default {
  name: "Task: Attachments",
  description:
    "Renders the task's attachments (images, files) in the detail pane.",
  contributions: [
    TaskDetailSlots.Section({ id: "attachments", label: "Attachments", component: TaskAttachments }),
  ],
} satisfies PluginDefinition;

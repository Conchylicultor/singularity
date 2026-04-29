import type { PluginDefinition } from "@core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskFilePeek } from "./components/task-file-peek";

export default {
  id: "task-file-peek",
  name: "Task: File peek",
  description:
    "Right-panel preview for files referenced from a task description. Reads filePath from the task-detail file-peek context.",
  contributions: [
    TaskDetailSlots.SidePanel({ id: "file-peek", order: 0, component: TaskFilePeek }),
  ],
} satisfies PluginDefinition;

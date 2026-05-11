import type { PluginDefinition } from "@core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskEvents } from "./components/task-events";

export default {
  id: "task-events",
  name: "Task: Events",
  description:
    "Lists pushes, attempts, and conversations for a task. Clicking a conversation opens taskConversationPane.",
  contributions: [
    TaskDetailSlots.Section({ id: "events", label: "Events", component: TaskEvents }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskEvents } from "./components/task-events";

export default {
  description:
    "Lists pushes, attempts, and conversations for a task. Clicking a conversation opens conversationPane.",
  contributions: [
    TaskDetailSlots.Section({ id: "events", label: "Events", component: TaskEvents }),
  ],
} satisfies PluginDefinition;

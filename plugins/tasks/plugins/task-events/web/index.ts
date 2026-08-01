import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskAttempts, TaskPushes } from "./components/task-events";

export default {
  description:
    "Lists pushes, attempts, and conversations for a task. Clicking a conversation opens conversationPane.",
  contributions: [
    // Two peer cards, not one card wrapping two titled blocks: the host owns the
    // title now, so the old "Events" wrapper would have stacked three titles deep.
    TaskDetailSlots.Section({
      id: "pushes",
      label: "Pushes",
      component: TaskPushes,
      // Was a `Collapsible defaultOpen` before the host owned the card.
      useDefaultOpen: () => true,
    }),
    TaskDetailSlots.Section({
      id: "attempts",
      label: "Attempts",
      component: TaskAttempts,
      // Was a `Collapsible defaultOpen` before the host owned the card.
      useDefaultOpen: () => true,
    }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskDescription } from "./components/task-description";

export default {
  description:
    "Prompt section of the task detail pane: the description editor, the contributed launch options (tasks/launch-options), and the Launch button — everything that feeds the agent's first turn, in one card. Inline file-link parsing routes clicks to the active file-peek context.",
  contributions: [
    TaskDetailSlots.Section({
      // The id is the persisted open-state / reorder key — kept as `description`
      // so the rename to "Prompt" resets neither.
      id: "description",
      label: "Prompt",
      component: TaskDescription,
      // Was a `Collapsible defaultOpen` before the host owned the card.
      useDefaultOpen: () => true,
    }),
  ],
} satisfies PluginDefinition;

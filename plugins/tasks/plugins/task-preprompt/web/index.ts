import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskPrepromptControl } from "./components/task-preprompt-section";

export { useTaskPreprompt } from "./hooks";

export default {
  description:
    "Per-task preprompt picker in the task detail pane; the selection is prepended to the agent's first user turn on launch.",
  contributions: [
    // One select is the whole section: contributed as `actions` with no
    // `component`, so the card is a single row rather than a chevron over one
    // control. With no body there is also no open state left to seed.
    TaskDetailSlots.Section({
      id: "preprompt",
      label: "Preprompt",
      actions: TaskPrepromptControl,
    }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskEffortControl } from "./components/task-effort-section";

export { useTaskEffort } from "./hooks";

export default {
  description:
    "Per-task thinking-mode (effort) picker in the task detail pane; the selection is applied to Claude Code on launch.",
  contributions: [
    // One select is the whole section: contributed as `actions` with no
    // `component`, so the card is a single row rather than a chevron over one
    // control. With no body there is also no open state left to seed.
    TaskDetailSlots.Section({
      id: "effort",
      label: "Thinking mode",
      actions: TaskEffortControl,
    }),
  ],
} satisfies PluginDefinition;

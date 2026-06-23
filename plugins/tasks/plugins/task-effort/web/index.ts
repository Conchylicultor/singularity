import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskEffortSection } from "./components/task-effort-section";

export { useTaskEffort } from "./hooks";

export default {
  description:
    "Per-task thinking-mode (effort) picker in the task detail pane; the selection is applied to Claude Code on launch.",
  contributions: [
    TaskDetailSlots.Section({ id: "effort", label: "Thinking mode", component: TaskEffortSection }),
  ],
} satisfies PluginDefinition;

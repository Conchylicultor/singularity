import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskPrompt } from "@plugins/tasks/plugins/task-description/web";
import { TaskEffortControl } from "./components/task-effort-section";

export { useTaskEffort } from "./hooks";

export default {
  description:
    "Per-task thinking-mode (effort) picker, contributed as a launch option of the task detail's Prompt card; the selection is applied to Claude Code on launch.",
  contributions: [
    // A launch option, not a section: it configures how the agent runs, so it
    // belongs in the Prompt card beside the description and the Launch button
    // rather than in its own one-line card down the pane.
    TaskPrompt.LaunchOption({
      id: "effort",
      label: "Thinking mode",
      component: TaskEffortControl,
    }),
  ],
} satisfies PluginDefinition;

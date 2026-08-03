import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskPrompt } from "@plugins/tasks/plugins/task-description/web";
import { TaskPrepromptControl } from "./components/task-preprompt-section";

export { useTaskPreprompt } from "./hooks";

export default {
  description:
    "Per-task preprompt picker, contributed as a launch option of the task detail's Prompt card; the selection is prepended to the agent's first user turn on launch.",
  contributions: [
    // A launch option, not a section: it configures the agent's first turn, so
    // it belongs in the Prompt card beside the description and the Launch
    // button rather than in its own one-line card down the pane.
    TaskPrompt.LaunchOption({
      id: "preprompt",
      label: "Preprompt",
      component: TaskPrepromptControl,
    }),
  ],
} satisfies PluginDefinition;

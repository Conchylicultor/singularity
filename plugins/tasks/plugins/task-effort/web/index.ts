import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskLaunch } from "@plugins/tasks/plugins/launch-options/web";
import { EFFORT_REGISTRY } from "@plugins/conversations/plugins/effort-provider/core";
import { effortLaunchOption } from "../core";
import { EffortLaunchControl } from "./components/effort-control";
import { useTaskEffortBinding } from "./internal/binding";

export { useTaskEffort } from "./hooks";

export default {
  description:
    "Per-task thinking-mode (effort) picker, contributed as a launch option of both the task detail's Prompt card and the task-draft popover; the selection is applied to Claude Code on launch.",
  contributions: [
    // A launch option, not a section: it configures how the agent runs, so it
    // belongs beside the description and the Launch button rather than in its
    // own one-line card down the pane.
    TaskLaunch.Option({
      id: effortLaunchOption.id,
      label: "Thinking mode",
      def: effortLaunchOption,
      component: EffortLaunchControl,
      useTaskBinding: useTaskEffortBinding,
      summarize: (level) => (level ? EFFORT_REGISTRY[level].label : null),
    }),
  ],
} satisfies PluginDefinition;

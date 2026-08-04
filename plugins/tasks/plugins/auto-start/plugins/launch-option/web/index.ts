import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskLaunch } from "@plugins/tasks/plugins/launch-options/web";
import { modelDisplayLabel } from "@plugins/conversations/plugins/model-provider/core";
import { autoStartLaunchOption } from "../core";
import { AutoStartLaunchControl } from "./components/auto-start-control";
import { useTaskAutoStartBinding } from "./internal/binding";

export default {
  description:
    "Auto-start model picker as a launch option: the same controlled select on the task detail's Prompt card (bound to the task's row) and on the task-draft popover (bound to the draft card).",
  contributions: [
    TaskLaunch.Option({
      id: autoStartLaunchOption.id,
      label: "Auto-start",
      def: autoStartLaunchOption,
      component: AutoStartLaunchControl,
      useTaskBinding: useTaskAutoStartBinding,
      summarize: (model) => (model ? modelDisplayLabel(model) : null),
    }),
  ],
} satisfies PluginDefinition;

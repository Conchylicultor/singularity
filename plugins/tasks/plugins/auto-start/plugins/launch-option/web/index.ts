import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskLaunch } from "@plugins/tasks/plugins/launch-options/web";
import { modelDisplayLabel } from "@plugins/conversations/plugins/model-provider/core";
import { MdAutoAwesome } from "react-icons/md";
import { autoStartLaunchOption } from "../core";
import { AutoStartLaunchControl } from "./components/auto-start-control";
import {
  AutoStartPillValue,
  AutoStartPillMenu,
  AUTO_START_OFF_LABEL,
} from "./components/auto-start-pill";
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
      // On a composer bar it fuses with the thinking mode into the one run
      // pill — `✦ Opus 5  Max` — at the trailing end, where the bar reads as
      // "what happens when you submit".
      pill: {
        icon: MdAutoAwesome,
        Value: AutoStartPillValue,
        // Fused with the thinking mode, so it is always on screen: off it reads
        // "Off" rather than disappearing out from under the user.
        unsetLabel: AUTO_START_OFF_LABEL,
        MenuGroup: AutoStartPillMenu,
        cluster: "run",
        side: "end",
      },
      useTaskBinding: useTaskAutoStartBinding,
      summarize: (model) => (model ? modelDisplayLabel(model) : null),
    }),
  ],
} satisfies PluginDefinition;

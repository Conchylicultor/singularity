import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskLaunch } from "@plugins/tasks/plugins/launch-options/web";
import { MdOutlineArticle } from "react-icons/md";
import { prepromptLaunchOption } from "../core";
import { PrepromptLaunchControl } from "./components/preprompt-control";
import {
  PrepromptPillValue,
  PrepromptPillMenu,
} from "./components/preprompt-pill";
import { useTaskPrepromptBinding } from "./internal/binding";

export { useTaskPreprompt } from "./hooks";

export default {
  description:
    "Per-task preprompt picker, contributed as a launch option of both the task detail's Prompt card and the task-draft popover; the selection is prepended to the agent's first user turn on launch.",
  contributions: [
    // A launch option, not a section: it configures the agent's first turn, so
    // it belongs beside the description and the Launch button rather than in
    // its own one-line card down the pane.
    TaskLaunch.Option({
      id: prepromptLaunchOption.id,
      label: "Preprompt",
      def: prepromptLaunchOption,
      component: PrepromptLaunchControl,
      // Its own pill on the leading half of a composer bar: a preprompt shapes
      // what the agent is told, which belongs beside the prose rather than with
      // the run controls.
      pill: {
        icon: MdOutlineArticle,
        Value: PrepromptPillValue,
        MenuGroup: PrepromptPillMenu,
        side: "start",
      },
      useTaskBinding: useTaskPrepromptBinding,
      // No `summarize`: a preprompt's human title lives in the `preprompts`
      // config, which only a hook can read — and the toast summary is a pure
      // function of the value. The id alone would be noise.
    }),
  ],
} satisfies PluginDefinition;

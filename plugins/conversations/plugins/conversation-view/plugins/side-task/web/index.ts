import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { taskSidePane } from "./panes";
import { ExpandTaskButton } from "./components/expand-task-button";

export { taskSidePane } from "./panes";

export default {
  id: "conversation-side-task",
  name: "Conversation: Side Task",
  description:
    "Right side pane that shows a single task's detail alongside the host conversation (read-only-ish; expand to pop out).",
  contributions: [
    Pane.Register({ pane: taskSidePane }),
    taskSidePane.Actions({ component: ExpandTaskButton }),
  ],
} satisfies PluginDefinition;

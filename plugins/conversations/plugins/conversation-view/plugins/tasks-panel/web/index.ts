import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { TasksButton } from "./components/tasks-button";
import { GoToParentAction } from "./components/go-to-parent-action";
import { ExpandToTasksAction } from "./components/expand-to-tasks-action";
import { convTasksPane } from "./panes";

export default {
  name: "Conversation: Tasks panel",
  description:
    "Toolbar button that opens a right pane showing the task tree (active task + children) and the task detail.",
  contributions: [
    Pane.Register({ pane: convTasksPane }),
    Conversation.ActionBar({ id: "tasks", component: TasksButton }),
    convTasksPane.Actions({ component: GoToParentAction }),
    convTasksPane.Actions({ component: ExpandToTasksAction }),
  ],
} satisfies PluginDefinition;

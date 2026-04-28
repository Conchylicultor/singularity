import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { TasksPane } from "./components/tasks-pane";

export const convTasksPane = Pane.define({
  id: "conv-tasks",
  parent: conversationPane,
  path: "tasks",
  component: TasksPane,
});

import { Pane } from "@plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { TasksPane } from "./components/tasks-pane";
import { ConvFilePeekPane } from "./components/conv-file-peek-pane";

export const convTasksPane = Pane.define({
  id: "conv-tasks",
  parent: conversationPane,
  path: "tasks",
  component: TasksPane,
});

export const convFilePeekPane = Pane.define({
  id: "conv-file-peek",
  parent: conversationPane,
  path: "file/:filePath*",
  component: ConvFilePeekPane,
});

import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { SideTaskBody } from "./components/side-task-body";

export const taskSidePane = Pane.define({
  id: "task-side",
  parent: conversationPane,
  path: "task/:taskId",
  component: SideTaskBody,
  chrome: {
    history: false,
    expand: ({ taskId }) => `/tasks/${taskId}`,
  },
});

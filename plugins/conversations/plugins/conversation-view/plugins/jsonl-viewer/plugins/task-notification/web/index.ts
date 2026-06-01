import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { TaskNotificationRow } from "./components/task-notification-row";

export default {
  id: "conversation-jsonl-viewer-task-notification",
  name: "JSONL Viewer: Task notification renderer",
  description:
    "Renders background task completion notifications in the JSONL viewer.",
  contributions: [
    JsonlViewer.EventRenderer({
      match: "task-notification",
      component: TaskNotificationRow,
    }),
  ],
} satisfies PluginDefinition;

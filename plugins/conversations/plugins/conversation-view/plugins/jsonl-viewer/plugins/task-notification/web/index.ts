import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { TaskNotificationRow } from "./components/task-notification-row";
import { TaskNotification } from "./slots";

export { TaskNotification } from "./slots";
export type {
  TaskNotificationClaim,
  TaskNotificationEvent,
  TaskNotificationOpenContribution,
  TaskNotificationTarget,
} from "./slots";

export default {
  description:
    "Renders background task completion notifications in the JSONL viewer, with a button onto the finished task that the owning plugin contributes through TaskNotification.Open (first claim wins).",
  contributions: [
    JsonlViewer.EventRenderer({
      match: "task-notification",
      component: TaskNotificationRow,
    }),
  ],
  slots: TaskNotification,
} satisfies PluginDefinition;

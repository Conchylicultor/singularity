import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { TaskReminderAttachmentView } from "./components/task-reminder-attachment-view";

export default {
  id: "conversation-jsonl-viewer-attachment-task-reminder",
  name: "JSONL Viewer: task-reminder attachment renderer",
  collapsed: true,
  description:
    "Renders task-reminder attachment events showing periodic task list injections.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      subtype: "task_reminder",
      component: TaskReminderAttachmentView,
    }),
  ],
} satisfies PluginDefinition;

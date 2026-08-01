import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import {
  TaskAttachments,
  TaskAttachmentsCount,
  useAttachmentsAvailable,
} from "./components/task-attachments";

export default {
  description:
    "Renders the task's attachments (images, files) in the detail pane.",
  contributions: [
    TaskDetailSlots.Section({
      id: "attachments",
      label: "Attachments",
      component: TaskAttachments,
      summary: TaskAttachmentsCount,
      // The component used to render nothing at all when the task had no files.
      useAvailable: useAttachmentsAvailable,
      // Was a `Collapsible defaultOpen` before the host owned the card.
      useDefaultOpen: () => true,
    }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { DateChangeAttachmentView } from "./components/date-change-attachment-view";

export default {
  collapsed: true,
  description:
    "Renders date_change attachment events (harness notice that the calendar date advanced mid-conversation).",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "date_change",
      component: DateChangeAttachmentView,
    }),
  ],
} satisfies PluginDefinition;

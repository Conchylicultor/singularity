import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { QueuedCommandAttachmentView } from "./components/queued-command-attachment-view";

export default {
  collapsed: true,
  description:
    "Renders queued_command attachment events — a prompt the user queued while the agent was busy, awaiting delivery on the next turn.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "queued_command",
      component: QueuedCommandAttachmentView,
    }),
  ],
} satisfies PluginDefinition;

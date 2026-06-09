import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { AttachmentRow } from "./components/attachment-row";

export { JsonlViewerAttachment } from "./slots";

export default {
  collapsed: true,
  description:
    "Renders attachment JSONL events with subtype dispatch to per-attachment renderer plugins.",
  contributions: [
    JsonlViewer.EventRenderer({ match: "attachment", component: AttachmentRow }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { EditedTextFileView } from "./components/edited-text-file-view";

export default {
  collapsed: true,
  description:
    "Renders edited-text-file attachment events as a collapsible file path with the resulting file content shown as a syntax-highlighted code listing.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "edited_text_file",
      component: EditedTextFileView,
    }),
  ],
} satisfies PluginDefinition;

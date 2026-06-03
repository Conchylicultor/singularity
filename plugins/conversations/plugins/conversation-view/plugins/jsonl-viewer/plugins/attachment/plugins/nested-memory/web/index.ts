import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { NestedMemoryAttachmentView } from "./components/nested-memory-attachment-view";

export default {
  name: "JSONL Viewer: nested-memory attachment renderer",
  collapsed: true,
  description:
    "Renders nested-memory attachment events showing which CLAUDE.md files were loaded as context.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "nested_memory",
      component: NestedMemoryAttachmentView,
    }),
  ],
} satisfies PluginDefinition;

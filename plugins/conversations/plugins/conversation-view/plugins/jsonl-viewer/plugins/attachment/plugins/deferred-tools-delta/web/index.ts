import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { DeferredToolsDeltaView } from "./components/deferred-tools-delta-view";

export default {
  id: "conversation-jsonl-viewer-attachment-deferred-tools-delta",
  name: "JSONL Viewer: deferred-tools-delta attachment renderer",
  collapsed: true,
  description:
    "Renders deferred-tools-delta attachment events showing tools becoming available or removed mid-session.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "deferred_tools_delta",
      component: DeferredToolsDeltaView,
    }),
  ],
} satisfies PluginDefinition;

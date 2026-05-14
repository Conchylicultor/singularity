import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { ReadToolView } from "./components/read-tool-view";

export default {
  id: "conversation-jsonl-viewer-tool-call-read",
  name: "JSONL Viewer: Read tool renderer",
  description:
    "Renders Read tool calls with syntax-highlighted file content, line-number gutter, and image thumbnails.",
  contributions: [
    JsonlViewerTool.Renderer({ name: "Read", component: ReadToolView }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { WriteToolView } from "./components/write-tool-view";

export default {
  id: "conversation-jsonl-viewer-tool-call-write",
  name: "JSONL Viewer: Write tool renderer",
  description:
    "Renders Write tool calls with syntax-highlighted file content and clickable path affordances.",
  contributions: [
    JsonlViewerTool.Renderer({ match: "Write", component: WriteToolView }),
  ],
} satisfies PluginDefinition;

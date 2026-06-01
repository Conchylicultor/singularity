import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { FlagRaiseToolView } from "./components/flag-raise-tool-view";

export default {
  id: "conversation-jsonl-viewer-tool-call-flag-raise",
  name: "JSONL Viewer: flag_raise tool renderer",
  description:
    "Renders flag_raise MCP tool calls with the flagged reason displayed as a warning banner.",
  contributions: [
    JsonlViewerTool.Renderer({
      match: /flag_raise$/,
      component: FlagRaiseToolView,
    }),
  ],
} satisfies PluginDefinition;

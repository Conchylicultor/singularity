import type { PluginDefinition } from "@core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { BashToolView } from "./components/bash-tool-view";

export default {
  id: "conversation-jsonl-viewer-tool-call-bash",
  name: "JSONL Viewer: Bash tool renderer",
  description:
    "Renders Bash tool calls with a syntax-highlighted command, optional description label, and ANSI-stripped output.",
  contributions: [
    JsonlViewerTool.Renderer({ name: "Bash", component: BashToolView }),
  ],
} satisfies PluginDefinition;

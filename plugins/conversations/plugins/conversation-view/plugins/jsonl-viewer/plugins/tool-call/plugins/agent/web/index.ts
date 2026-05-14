import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { AgentToolView } from "./components/agent-tool-view";

export default {
  id: "conversation-jsonl-viewer-tool-call-agent",
  name: "JSONL Viewer: Agent tool renderer",
  description:
    "Renders Agent tool calls with subagent type, model badge, prompt (markdown), and report (markdown).",
  contributions: [
    JsonlViewerTool.Renderer({ name: "Agent", component: AgentToolView }),
  ],
} satisfies PluginDefinition;

import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { JsonlViewerTool } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { AgentToolView } from "./components/agent-tool-view";
import { agentReportPane } from "./panes";

export default {
  description:
    "Renders Agent tool calls with subagent type, model badge, prompt (markdown), and report (markdown).",
  contributions: [
    JsonlViewerTool.Renderer({ match: "Agent", component: AgentToolView }),
    Pane.Register({ pane: agentReportPane }),
  ],
} satisfies PluginDefinition;

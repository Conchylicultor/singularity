import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { McpInstructionsDeltaView } from "./components/mcp-instructions-delta-view";

export default {
  collapsed: true,
  description:
    "Renders mcp_instructions_delta attachment events — an MCP server's standing instructions entering or leaving the agent's context mid-session — in the same +/− grammar as the deferred-tools delta.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "mcp_instructions_delta",
      component: McpInstructionsDeltaView,
    }),
  ],
} satisfies PluginDefinition;

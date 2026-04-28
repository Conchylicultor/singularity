import type { ServerPluginDefinition } from "@server/types";
import { conversationSummariesResource } from "./internal/resources";
import { handleGenerate } from "./internal/handle-generate";

// Side-effect import: registers the `submit_conversation_summary` MCP tool
// at module load time so the spawned Sonnet conversation can call it.
import "./internal/mcp-tools";

export { _conversationSummaries } from "./internal/tables";
export { conversationSummariesResource } from "./internal/resources";

export default {
  id: "conversation-summary",
  name: "Conversation Summary",
  description:
    "On-demand structured summaries of conversations: phase, flags, next action. Curated by Sonnet via MCP. Append-only history.",
  resources: [conversationSummariesResource],
  httpRoutes: {
    "POST /api/conversation-summary/:conversationId/generate": handleGenerate,
  },
} satisfies ServerPluginDefinition;

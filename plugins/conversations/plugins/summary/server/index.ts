import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { conversationSummariesResource } from "./internal/resources";
import { handleGenerate } from "./internal/handle-generate";
import { submitConversationSummaryTool } from "./internal/mcp-tools";

export { _conversationSummaries } from "./internal/tables";
export { conversationSummariesResource } from "./internal/resources";

export default {
  id: "conversation-summary",
  name: "Conversation Summary",
  description:
    "On-demand structured summaries of conversations: phase, flags, next action. Curated by Sonnet via MCP. Append-only history.",
  contributions: [Resource.Declare(conversationSummariesResource)],
  httpRoutes: {
    "POST /api/conversation-summary/:conversationId/generate": handleGenerate,
  },
  register: [submitConversationSummaryTool],
} satisfies ServerPluginDefinition;

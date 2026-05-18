import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { conversationSummariesResource } from "./internal/resources";
import { handleGenerate } from "./internal/handle-generate";
import { submitConversationSummaryTool } from "./internal/mcp-tools";
import { generateConversationSummary } from "../shared/endpoints";

export { _conversationSummaries } from "./internal/tables";
export { conversationSummariesResource } from "./internal/resources";

export default {
  id: "conversation-summary",
  name: "Conversation Summary",
  description:
    "On-demand structured summaries of conversations: phase, flags, next action. Curated by Sonnet via MCP. Append-only history.",
  contributions: [Resource.Declare(conversationSummariesResource)],
  httpRoutes: {
    [generateConversationSummary.route]: handleGenerate,
  },
  register: [submitConversationSummaryTool],
} satisfies ServerPluginDefinition;

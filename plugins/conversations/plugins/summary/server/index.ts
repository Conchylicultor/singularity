import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { conversationSummariesServed } from "./internal/resources";
import { handleGenerate } from "./internal/handle-generate";
import { submitConversationSummaryTool } from "./internal/mcp-tools";
import { generateConversationSummary } from "../shared/endpoints";
import { IdKinds } from "@plugins/ids/server";
import { summaryIdKind } from "../core";

export { _conversationSummaries } from "./internal/tables";

export default {
  description:
    "On-demand structured summaries of conversations: phase, flags, next action. Curated by Sonnet via MCP. Append-only history.",
  contributions: [
    IdKinds.Kind({ kind: summaryIdKind }),
    ...conversationSummariesServed.declare,
  ],
  httpRoutes: {
    [generateConversationSummary.route]: handleGenerate,
  },
  register: [submitConversationSummaryTool],
} satisfies ServerPluginDefinition;

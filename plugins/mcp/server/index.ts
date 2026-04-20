import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleMcpRequest } from "./internal/handle-mcp";

export { Mcp } from "./api";
export type { McpTool, McpToolContext, McpToolResult } from "./api";

export default {
  id: "mcp",
  name: "MCP",
  description:
    "HTTP MCP server endpoint. Hosts tools contributed by other plugins via Mcp.registerTool.",
  httpRoutes: {
    "POST /api/mcp/:conversationId": handleMcpRequest,
  },
} satisfies ServerPluginDefinition;

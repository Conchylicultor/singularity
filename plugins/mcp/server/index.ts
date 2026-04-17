import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleMcpRequest } from "./internal/handle-mcp";

const plugin: ServerPluginDefinition = {
  id: "mcp",
  name: "MCP",
  description:
    "HTTP MCP server endpoint. Hosts tools contributed by other plugins via Mcp.registerTool.",
  httpRoutes: {
    "POST /api/mcp/:conversationId": handleMcpRequest,
  },
};
export default plugin;

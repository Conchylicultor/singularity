import type { ServerPluginDefinition } from "@server/types";
import { queryDbTool } from "./internal/mcp-tools";

export default {
  id: "database-query",
  name: "Database Query",
  description:
    "MCP tool for agents to query worktree databases for debugging and inspection.",
  register: [queryDbTool],
} satisfies ServerPluginDefinition;

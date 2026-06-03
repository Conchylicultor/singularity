import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { queryDbTool } from "./internal/mcp-tools";

export default {
  name: "Database Query",
  description:
    "MCP tool for agents to query worktree databases for debugging and inspection.",
  register: [queryDbTool],
} satisfies ServerPluginDefinition;

import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { readLogsTool } from "./internal/mcp-tools";

export default {
  name: "Logs MCP",
  description:
    "MCP tool for agents to read persisted browser/server log channels for a worktree.",
  register: [readLogsTool],
} satisfies ServerPluginDefinition;

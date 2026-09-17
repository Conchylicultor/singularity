import type { McpInstructions, McpTool } from "./mcp";

export const registry = new Map<string, McpTool>();

/** `Mcp.instructions` contributions, keyed by id. */
export const instructionsRegistry = new Map<string, McpInstructions>();

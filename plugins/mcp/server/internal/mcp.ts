import type { z } from "zod";
import { registry } from "./registry";

export interface McpToolContext {
  conversationId: string;
}

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

export interface McpTool<T extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: T;
  handler: (
    args: z.objectOutputType<T, z.ZodTypeAny>,
    ctx: McpToolContext,
  ) => Promise<McpToolResult> | McpToolResult;
}

export const Mcp = {
  registerTool<T extends z.ZodRawShape>(tool: McpTool<T>): void {
    if (registry.has(tool.name)) {
      throw new Error(`MCP tool "${tool.name}" already registered`);
    }
    registry.set(tool.name, tool as unknown as McpTool);
  },
};

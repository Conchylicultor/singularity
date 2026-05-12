import type { z } from "zod";
import type { Registration } from "@server/types";
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
  /**
   * Returns a {@link Registration} token. The actual `registry.set` (and the
   * duplicate-name guard) fire when the framework invokes `.register()`
   * during the plugin register phase. Plugins list the result in their
   * `register` array on `ServerPluginDefinition`.
   */
  tool<T extends z.ZodRawShape>(tool: McpTool<T>): Registration {
    return {
      _kind: "mcp-tool",
      _doc: { label: tool.name, detail: tool.description.split("\n")[0] },
      register() {
        if (registry.has(tool.name)) {
          throw new Error(`MCP tool "${tool.name}" already registered`);
        }
        registry.set(tool.name, tool as unknown as McpTool);
      },
    };
  },
};

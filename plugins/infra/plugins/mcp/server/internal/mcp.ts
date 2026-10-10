import type { z } from "zod";
import type { Registration } from "@plugins/framework/plugins/server-core/core";
import { instructionsRegistry, registry } from "./registry";

export interface McpToolContext {
  conversationId: string;
}

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

export interface McpTool<T extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  /** The fixed text of the tool's description. */
  description: string;
  /**
   * A LIVE section appended to {@link description} (after a blank line):
   * rendered per request, and only for a request that lists the tools
   * (`tools/list`), so it states the data as of the moment the client listed
   * them — typically once, at connect. For facts an agent needs while using the
   * tool that live in the database (a vocabulary to pick from), where a fixed
   * string would go stale. `null` (or blank) contributes nothing. A render that
   * throws fails the listing — loud, never a silently missing section.
   */
  liveDescription?: (ctx: McpToolContext) => Promise<string | null>;
  inputSchema: T;
  /**
   * Whether this conversation sees the tool. Evaluated on every MCP request
   * (keep it to a cheap lookup); when false the tool is neither listed in
   * `tools/list` nor callable for that request. Omitted: always visible. A
   * `when` that throws fails the request.
   */
  when?: (ctx: McpToolContext) => boolean | Promise<boolean>;
  handler: (
    args: z.objectOutputType<T, z.ZodTypeAny>,
    ctx: McpToolContext,
  ) => Promise<McpToolResult> | McpToolResult;
}

/**
 * A section of the server-level instructions an MCP client receives once, in
 * the `initialize` result, at connect. Rendered per connection with the
 * connecting conversation's context; return `null` to contribute nothing for
 * that conversation. A render that throws fails the `initialize` request.
 */
export interface McpInstructions {
  /** Unique id. Sections are joined in id order. */
  id: string;
  render: (ctx: McpToolContext) => Promise<string | null>;
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
      _factory: "mcpTool",
      _doc: { label: tool.name, detail: tool.description.split("\n")[0] },
      register() {
        if (registry.has(tool.name)) {
          throw new Error(`MCP tool "${tool.name}" already registered`);
        }
        registry.set(tool.name, tool as unknown as McpTool);
      },
    };
  },
  /**
   * Contributes a section to the MCP server instructions sent at `initialize`.
   * Returns a {@link Registration} token; list it in the plugin's `register`
   * array. Duplicate ids throw at register time.
   */
  instructions(instructions: McpInstructions): Registration {
    return {
      _kind: "mcp-instructions",
      _factory: "mcpInstructions",
      _doc: { label: instructions.id },
      register() {
        if (instructionsRegistry.has(instructions.id)) {
          throw new Error(
            `MCP instructions "${instructions.id}" already registered`,
          );
        }
        instructionsRegistry.set(instructions.id, instructions);
      },
    };
  },
};

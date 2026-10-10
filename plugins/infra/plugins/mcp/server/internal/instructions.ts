import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpToolContext } from "./mcp";
import { instructionsRegistry } from "./registry";

/**
 * The JSON-RPC messages a POST body holds (one, or a batch). Reads a clone so
 * the transport still consumes the original body. Unparseable JSON holds none:
 * the transport answers it with its own JSON-RPC parse error.
 */
export async function bodyMessages(req: Request): Promise<unknown[]> {
  let body: unknown;
  try {
    body = await req.clone().json();
  } catch (err) {
    if (err instanceof SyntaxError) return [];
    throw err;
  }
  return Array.isArray(body) ? body : [body];
}

/** Whether the messages are (or contain) an `initialize` request. */
export function hasInitialize(messages: readonly unknown[]): boolean {
  return messages.some(isInitializeRequest);
}

/** Whether the messages are (or contain) a `tools/list` request. */
export function hasToolsList(messages: readonly unknown[]): boolean {
  return messages.some(
    (m) =>
      typeof m === "object" &&
      m !== null &&
      (m as { method?: unknown }).method === "tools/list",
  );
}

/**
 * Renders every `Mcp.instructions` contribution in id order, drops the ones
 * that returned `null`, and joins the rest with blank lines. `undefined` when
 * nothing was contributed, so the initialize result omits the field. A
 * contribution that throws rejects the whole render (no swallowing).
 */
export async function renderInstructions(
  ctx: McpToolContext,
): Promise<string | undefined> {
  const contributions = [...instructionsRegistry.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const sections = await Promise.all(contributions.map((c) => c.render(ctx)));
  const text = sections
    .filter((s): s is string => s !== null && s.trim() !== "")
    .join("\n\n");
  return text === "" ? undefined : text;
}

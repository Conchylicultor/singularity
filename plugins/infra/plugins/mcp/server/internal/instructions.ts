import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpToolContext } from "./mcp";
import { instructionsRegistry } from "./registry";

/**
 * Whether a POST body is (or, as a JSON-RPC batch, contains) an `initialize`
 * request. Reads a clone so the transport still consumes the original body.
 * Unparseable JSON is not an initialize: the transport answers it with its own
 * JSON-RPC parse error.
 */
export async function isInitializeBody(req: Request): Promise<boolean> {
  let body: unknown;
  try {
    body = await req.clone().json();
  } catch (err) {
    if (err instanceof SyntaxError) return false;
    throw err;
  }
  const messages: unknown[] = Array.isArray(body) ? body : [body];
  return messages.some(isInitializeRequest);
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

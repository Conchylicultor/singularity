import type { ToolCallEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";

/** A deferred tool's name split for display: MCP tools read as their own name,
 *  with the server that provides them kept aside. */
export interface ToolName {
  /** The full name the model calls it by (`mcp__singularity__add_task`). */
  id: string;
  /** What a reader recognises (`add_task`). */
  name: string;
  /** The MCP server providing it (`singularity`), absent for built-in tools. */
  server?: string;
}

const MCP_NAME = /^mcp__(.+?)__(.+)$/;

export function toolName(id: string): ToolName {
  const m = MCP_NAME.exec(id);
  return m ? { id, name: m[2]!, server: m[1]! } : { id, name: id };
}

/**
 * What one ToolSearch call asked for and got back.
 *
 * `select:a,b` loads named tools directly; any other query is a keyword search
 * ranked by the harness. A select states what it expected, so a name it asked
 * for that did not come back is `missing` — a keyword search expects nothing
 * in particular, so it only has matches.
 */
export type ToolSearch =
  | {
      mode: "select";
      requested: ToolName[];
      /** Undefined while the call is in flight. */
      loaded?: ToolName[];
      missing: ToolName[];
    }
  | {
      mode: "search";
      query: string;
      maxResults?: number;
      /** Undefined while the call is in flight. */
      matches?: ToolName[];
    };

const SELECT_PREFIX = "select:";

export function readToolSearch(event: ToolCallEvent): ToolSearch {
  const input = (event.input ?? {}) as {
    query?: unknown;
    max_results?: unknown;
  };
  const query = typeof input.query === "string" ? input.query.trim() : "";
  // The result's tool_reference names ARE the loaded tools; a no-match result
  // is text ("No matching deferred tools found") with none.
  const returned = event.result
    ? (event.result.toolReferences ?? []).map(toolName)
    : undefined;

  if (query.startsWith(SELECT_PREFIX)) {
    const requested = query
      .slice(SELECT_PREFIX.length)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(toolName);
    // A select may name a tool by its bare name (`read_page`) and get back
    // its full id, so a request counts as served by either spelling.
    const served = (r: ToolName) =>
      returned?.some((t) => t.id === r.id || t.name === r.id) ?? true;
    return {
      mode: "select",
      requested,
      loaded: returned,
      missing: returned ? requested.filter((r) => !served(r)) : [],
    };
  }
  return {
    mode: "search",
    query,
    maxResults:
      typeof input.max_results === "number" ? input.max_results : undefined,
    matches: returned,
  };
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

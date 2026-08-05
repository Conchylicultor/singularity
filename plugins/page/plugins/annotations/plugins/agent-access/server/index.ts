import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  appendAgentNotesTool,
  editAgentNotesTool,
  readPageTool,
  writeAgentNotesTool,
} from "./internal/mcp-tools";

export default {
  description:
    "The agent-facing tool surface over a page: read_page (human-audience subtrees pruned) plus append/write/edit_agent_notes, which can address nothing but an <agent-notes> card. The policy over page/markdown-apply's audience-agnostic engine.",
  register: [readPageTool, appendAgentNotesTool, writeAgentNotesTool, editAgentNotesTool],
} satisfies ServerPluginDefinition;

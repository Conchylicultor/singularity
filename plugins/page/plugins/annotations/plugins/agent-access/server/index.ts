import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { editPageTool, readPageTool, writeAgentNoteTool } from "./internal/mcp-tools";

export default {
  description:
    "The agent-facing tool surface over a page, as the file triple: read_page (human-audience subtrees pruned), write_agent_note (one card's contents) and edit_page (any block, judged by what the diff touched — every write must land inside an <agent-note> card). The policy over page/markdown-apply's audience-agnostic engine.",
  register: [readPageTool, writeAgentNoteTool, editPageTool],
} satisfies ServerPluginDefinition;

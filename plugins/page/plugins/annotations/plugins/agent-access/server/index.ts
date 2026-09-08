import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  editPageTool,
  readPageTool,
  writeAgentNoteTool,
} from "./internal/mcp-tools";

export default {
  description:
    "The agent-facing tool surface over a page, as the file triple: read_page (human-audience subtrees pruned), write_agent_note (one card's contents) and edit_page (any block, judged by what the diff touched — every write must resolve inside a region an agent authors, so an <agent-note> card admits it and a <human> or <todo> card nested there refuses it). The policy over page/markdown-apply's audience-and-author-agnostic engine.",
  register: [readPageTool, writeAgentNoteTool, editPageTool],
} satisfies ServerPluginDefinition;

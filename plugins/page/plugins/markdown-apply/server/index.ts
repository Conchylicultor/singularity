import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { editPageTool, readPageTool, writePageTool } from "./internal/mcp-tools";

export { applyMarkdownToPage } from "./internal/apply";
export type { ApplyReport } from "./internal/apply";
export { readPageAsMarkdown } from "./internal/read";

export default {
  description:
    "Apply an edited markdown document onto an existing page's block forest without re-minting block ids: the read_page / write_page / edit_page MCP tools, the structural patch, and the per-block content-doc splice.",
  register: [readPageTool, writePageTool, editPageTool],
} satisfies ServerPluginDefinition;
